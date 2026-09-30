import { lumaOf } from './color';
import { DEFAULT_PARAMS, PROTOCOL_TIMING } from './params';
import { signalValue } from './signals';
import type { CaptureInput, FrameSample, Protocol, RGB, SignalKind } from './types';

/** Deterministic PRNG (mulberry32) + normal (Box-Muller). */
export function rng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(uniform(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
  return { uniform, normal };
}

/** Synthetic skin palettes (linear RGB). Perfused = normal; blanched = maximally pale. ILLUSTRATIVE, not measured data. */
export const SKIN_TONES: Record<'light' | 'medium' | 'dark', { perfused: RGB; blanched: RGB }> = {
  light: { perfused: { r: 0.55, g: 0.33, b: 0.25 }, blanched: { r: 0.6, g: 0.45, b: 0.36 } },
  medium: { perfused: { r: 0.36, g: 0.2, b: 0.13 }, blanched: { r: 0.4, g: 0.27, b: 0.18 } },
  dark: { perfused: { r: 0.14, g: 0.075, b: 0.05 }, blanched: { r: 0.155, g: 0.095, b: 0.065 } },
};

export interface SynthOptions {
  seed?: number;
  protocol?: Protocol;
  fps?: number;
  /** SD jitter timestamp (ms). */
  jitterMs?: number;
  /** Probability of a dropped frame. */
  dropProb?: number;
  baselineS?: number;
  pressS?: number;
  postS?: number;
  /** Target CRT in perfusion space p (seconds, X = 0.9). The actual ground truth is computed in signal space. */
  crtS?: number;
  shape?: 'exp' | 'sigmoid';
  /** Operator reaction time after the "release" cue (seconds). */
  releaseDelayS?: number;
  skin?: keyof typeof SKIN_TONES;
  /** Fraction of perfusion lost when pressed (1 = fully pale; 0 = no blanching). */
  blanchDepth?: number;
  /** Noise SD per channel (linear). */
  noiseSD?: number;
  /** 'additive' = absolute noise (penalizes dark skin); 'relative' = noise proportional to intensity (noiseSD is read as a fraction). */
  noiseModel?: 'additive' | 'relative';
  /** Relative heartbeat pulsation amplitude on the perfusion component. */
  ppgAmp?: number;
  ppgHz?: number;
  /** Global gain drift (per second, relative) — simulates auto-exposure. */
  gainDriftPerS?: number;
  /** Red-channel white-balance shift (relative, linear over the recording). */
  wbDriftR?: number;
  /** Brightness scale (0.1 = very dark). */
  brightness?: number;
  clipFrac?: number;
  sharpness?: number;
  /** ROI motion (px) starting at a given time (seconds since the start). */
  motion?: { atS: number; px: number } | null;
  roiSizePx?: number;
  /** The operator does not release the pressure. */
  noRelease?: boolean;
  /** Reactive hyperemia overshoot (fraction). */
  hyperemia?: number;
  withReference?: boolean;
  /** Start from this absolute time (to test timeline offsets). */
  tOffset?: number;
}

export interface SynthTruth {
  /** Actual release time (seconds relative to the start of the recording). */
  releaseS: number;
  /** Ground-truth CRT in signal space for a given threshold X. */
  crtAt: (x: number, kind?: SignalKind) => number | null;
}

function perfusionCurve(o: Required<Omit<SynthOptions, 'motion' | 'seed' | 'tOffset'>>, relS: number) {
  const pressAt = o.baselineS;
  const trough = 1 - o.blanchDepth;
  const tau = o.crtS / Math.log(10); // p reaches 90% recovery at crtS (exp shape)
  return (t: number): number => {
    if (t < pressAt) return 1;
    const blanch = trough + (1 - trough) * Math.exp(-(t - pressAt) / 0.3);
    if (o.noRelease || t < relS) return blanch;
    const pAtRel = trough + (1 - trough) * Math.exp(-(relS - pressAt) / 0.3);
    const u = t - relS;
    let frac: number;
    if (o.shape === 'sigmoid') {
      // Logistic scaled so that frac(0)=0 and frac(crtS)=0.9.
      const k = 4.5 / o.crtS;
      const m = o.crtS * 0.45;
      const f = (x: number) => 1 / (1 + Math.exp(-k * (x - m)));
      frac = (f(u) - f(0)) / (1 - f(0));
      const f90 = (f(o.crtS) - f(0)) / (1 - f(0));
      frac = Math.min(1.2, (frac * 0.9) / f90);
    } else {
      frac = 1 - Math.exp(-u / tau);
    }
    const over = o.hyperemia * Math.exp(-u / (o.crtS * 2)) * (1 - Math.exp(-u / tau));
    return pAtRel + (1 - pAtRel) * frac + over;
  };
}

function mix(a: RGB, b: RGB, w: number): RGB {
  return { r: a.r + (b.r - a.r) * w, g: a.g + (b.g - a.g) * w, b: a.b + (b.b - a.b) * w };
}

export function synthesize(opts: SynthOptions = {}): { input: CaptureInput; truth: SynthTruth } {
  const o = {
    protocol: 'A' as Protocol,
    fps: 30,
    jitterMs: 2,
    dropProb: 0,
    baselineS: PROTOCOL_TIMING.baselineS,
    pressS: PROTOCOL_TIMING.pressS,
    postS: PROTOCOL_TIMING.postReleaseS,
    crtS: 2.5,
    shape: 'exp' as const,
    releaseDelayS: 0.3,
    skin: 'medium' as const,
    blanchDepth: 0.85,
    noiseSD: 0.0015,
    ppgAmp: 0.01,
    ppgHz: 1.2,
    gainDriftPerS: 0,
    wbDriftR: 0,
    brightness: 1,
    clipFrac: 0,
    sharpness: 60,
    roiSizePx: 80,
    noRelease: false,
    hyperemia: 0,
    withReference: true,
    noiseModel: 'additive' as 'additive' | 'relative',
    ...opts,
  };
  const R = rng(opts.seed ?? 1);
  const tone = SKIN_TONES[o.skin];
  const refColor: RGB = mix(tone.perfused, tone.blanched, 0.05);
  const pressCue = o.baselineS;
  const releaseCue = o.baselineS + o.pressS;
  const releaseS = releaseCue + o.releaseDelayS;
  const total = releaseCue + o.postS;
  const p = perfusionCurve(o as never, releaseS);
  const tOff = opts.tOffset ?? 0;

  const colorAt = (t: number, withPpg: boolean): RGB => {
    let perf = p(t);
    if (withPpg) perf *= 1 + o.ppgAmp * Math.sin(2 * Math.PI * o.ppgHz * t);
    return mix(tone.blanched, tone.perfused, perf);
  };

  const frames: FrameSample[] = [];
  const period = 1 / o.fps;
  let dropped = 0;
  for (let i = 0; i * period <= total; i++) {
    const tNom = i * period;
    if (i > 0 && R.uniform() < o.dropProb) {
      dropped++;
      continue;
    }
    const t = tNom + (R.normal() * o.jitterMs) / 1000;
    const gain = o.brightness * (1 + o.gainDriftPerS * t);
    const wb = { r: 1 + o.wbDriftR * (t / total), g: 1, b: 1 };
    const nz = (v: number) => (o.noiseModel === 'relative' ? v * o.noiseSD : o.noiseSD) * R.normal();
    const obs = (c: RGB): RGB => {
      const r = c.r * gain * wb.r;
      const g = c.g * gain * wb.g;
      const b = c.b * gain * wb.b;
      return { r: Math.max(0, r + nz(r)), g: Math.max(0, g + nz(g)), b: Math.max(0, b + nz(b)) };
    };
    let roiTrue = colorAt(t, true);
    if (o.protocol === 'B' && t >= pressCue + 0.2 && t < releaseS + 0.15) roiTrue = tone.perfused; // covered by the operator's finger
    const roi = obs(roiTrue);
    const ref = o.withReference ? obs(refColor) : null;
    const moved = o.motion && t >= o.motion.atS ? o.motion.px : 0;
    frames.push({
      t: t + tOff,
      roi,
      ref,
      luma: lumaOf(roi),
      clipFrac: o.clipFrac,
      sharpness: o.sharpness,
      dx: moved,
      dy: 0,
      dropped: i > 0 ? dropped : 0,
    });
    dropped = 0;
  }

  const truth: SynthTruth = {
    releaseS,
    crtAt: (x: number, kind: SignalKind = DEFAULT_PARAMS.signalKind) => {
      if (o.noRelease) return null;
      // Ground truth in signal space: noise/PPG/drift-free signal, 1 ms resolution.
      const s = (t: number) => signalValue(kind, colorAt(t, false), o.withReference ? refColor : null);
      const base = s(pressCue - 0.5);
      const trough = s(releaseS - 1e-6);
      for (let u = 0; u <= o.postS + 5; u += 0.001) {
        const r = (s(releaseS + u) - trough) / (base - trough);
        if (r >= x) return u;
      }
      return null;
    },
  };

  return {
    input: {
      frames,
      markers: { pressCue: pressCue + tOff, releaseCue: releaseCue + tOff },
      protocol: o.protocol,
      roiSizePx: o.roiSizePx,
    },
    truth,
  };
}
