import { luminance } from './color';
import { hingeFit, isotonicBlocks, lowerBound, median, medianFilter, resampleUniform, robustSD, savgol, sliceByTime } from './filters';
import { DEFAULT_PARAMS, type EngineParams } from './params';
import { SIGNALS, referenceDriftRatio, signalValue } from './signals';
import type {
  CaptureInput,
  CheckCode,
  CrtResult,
  CurveData,
  EngineEvents,
  FrameSample,
  QualityCheck,
  TimingStats,
} from './types';

const LABELS: Record<CheckCode, [label: string, failMessage: string]> = {
  TOO_FEW_FRAMES: ['Frame count', 'Too few frames were recorded.'],
  LOW_FPS: ['Frame rate', 'The camera frame rate is too low.'],
  FRAME_DROPS: ['Dropped frames', 'Too many frames were dropped during recording.'],
  TIMING_JITTER: ['Timing jitter', 'The time between frames is unstable.'],
  GAP: ['Frame gap (recovery phase)', 'There is a recording gap during the recovery phase.'],
  SHORT_BASELINE: ['Baseline duration', 'The baseline before pressing is too short.'],
  TOO_DARK: ['Brightness (min)', 'The light is too dim. Turn on the torch or find brighter light.'],
  TOO_BRIGHT: ['Brightness (max)', 'The image is too bright/overexposed.'],
  CLIPPING: ['Saturated pixels', 'Part of the ROI is saturated (reflection/too bright). Change the camera or slide angle.'],
  BLUR: ['Sharpness', 'The image is blurry. Move the camera slightly away and wait for focus.'],
  MOTION: ['Motion (recovery phase)', 'The finger or camera moved during the recovery phase.'],
  REF_DRIFT: ['Reference color drift', 'The reference skin color changed (unstable white balance/lighting).'],
  REF_LUMA_DRIFT: ['Reference brightness drift', 'Brightness changed during recording (auto-exposure).'],
  NO_BLANCHING: ['Blanching amplitude', 'No skin blanching was detected. Make sure the pressure is sufficient and the pressed area is inside the ROI box.'],
  LOW_CONTRAST: ['Contrast vs noise (CNR)', 'The blanching contrast relative to noise is too low to measure reliably.'],
  RELEASE_NOT_DETECTED: ['Release detection', 'Pressure release / start of recovery was not detected. Repeat and release on the cue.'],
  NOISY_RECOVERY: ['Recovery-phase noise', 'The recovery curve is too noisy.'],
  NON_MONOTONIC: ['Recovery monotonicity', 'The recovery curve rises and falls inconsistently.'],
};

function check(code: CheckCode, value: number | null, comparator: '>=' | '<=', threshold: number, unit?: string): QualityCheck {
  const [label, failMessage] = LABELS[code];
  const pass = value === null || Number.isNaN(value) ? true : comparator === '>=' ? value >= threshold : value <= threshold;
  return { code, label, value: value === null || Number.isNaN(value) ? null : value, comparator, threshold, pass, unit, failMessage };
}

export function computeTiming(frames: FrameSample[]): TimingStats {
  const n = frames.length;
  if (n < 2) return { frames: n, durationS: 0, fps: 0, jitterMs: NaN, dropFrac: 0, maxGapS: NaN };
  const dts: number[] = [];
  for (let i = 1; i < n; i++) dts.push(frames[i].t - frames[i - 1].t);
  const durationS = frames[n - 1].t - frames[0].t;
  const medDt = median(dts);
  let drops = 0;
  const reported = frames.some((f) => f.dropped !== undefined);
  if (reported) drops = frames.reduce((s, f) => s + (f.dropped ?? 0), 0);
  else for (const dt of dts) drops += Math.max(0, Math.round(dt / medDt) - 1);
  return {
    frames: n,
    durationS,
    fps: (n - 1) / durationS,
    jitterMs: robustSD(dts) * 1000,
    dropFrac: drops / (n + drops),
    maxGapS: Math.max(...dts),
  };
}

/** First time (since `from`) r reaches x and holds; sub-sample linear interpolation. */
function crossing(t: number[], r: (number | null)[], from: number, x: number, holdS: number, tol: number): number | null {
  const dt = t.length > 1 ? t[1] - t[0] : 1;
  const hold = Math.max(1, Math.round(holdS / dt));
  for (let i = lowerBound(t, from); i < t.length; i++) {
    const ri = r[i];
    if (ri === null || ri < x) continue;
    let ok = true;
    for (let k = i; k < Math.min(t.length, i + hold); k++) {
      const rk = r[k];
      if (rk === null || rk < x - tol) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const prev = i > 0 ? r[i - 1] : null;
    if (prev !== null && prev < x && ri > prev && t[i - 1] >= from) return t[i - 1] + ((x - prev) / (ri - prev)) * dt;
    return Math.max(t[i], from);
  }
  return null;
}

function rejectEarly(
  input: CaptureInput,
  params: EngineParams,
  checks: QualityCheck[],
  timing: TimingStats,
  curve: CurveData,
  events: EngineEvents,
  normalized: boolean,
  warnings: string[],
): CrtResult {
  return finalize(input, params, checks, timing, curve, events, normalized, warnings, null, [], null);
}

function finalize(
  input: CaptureInput,
  params: EngineParams,
  checks: QualityCheck[],
  timing: TimingStats,
  curve: CurveData,
  events: EngineEvents,
  normalized: boolean,
  warnings: string[],
  crtMain: number | null,
  sensitivity: { x: number; crt: number | null }[],
  t50: number | null,
): CrtResult {
  const failed = checks.filter((c) => !c.pass);
  const rejected = failed.length > 0 || events.release === null;
  let status: CrtResult['status'] = 'rejected';
  let censoredAboveS: number | null = null;
  if (!rejected) {
    if (crtMain !== null) status = 'ok';
    else {
      status = 'censored';
      censoredAboveS = timing.durationS - (events.release ?? 0);
    }
  }
  return {
    status,
    crt: status === 'ok' ? crtMain : null,
    censoredAboveS,
    sensitivity: rejected ? [] : sensitivity,
    t50: rejected ? null : t50,
    recoveryX: params.recoveryX,
    checks,
    reasons: failed.map((c) => c.failMessage),
    warnings,
    curve,
    events,
    timing,
    signalKind: params.signalKind,
    normalized,
    protocol: input.protocol,
  };
}

/**
 * Post-capture analysis (zero-phase). Never outputs a CRT when any gate fails.
 */
export function analyzeCapture(input: CaptureInput, params: EngineParams = DEFAULT_PARAMS): CrtResult {
  const g = params.gates;
  const frames = [...input.frames].sort((a, b) => a.t - b.t).filter((f, i, arr) => i === 0 || f.t > arr[i - 1].t);
  const checks: QualityCheck[] = [];
  const warnings: string[] = [];
  const timing = computeTiming(frames);
  const t0 = frames.length ? frames[0].t : 0;
  const pressCue = input.markers.pressCue - t0;
  const releaseCue = input.markers.releaseCue - t0;
  const events: EngineEvents = {
    pressCue,
    releaseCue,
    baseline: null,
    trough: null,
    amplitude: null,
    noiseSD: null,
    release: null,
    recovery: null,
  };
  const emptyCurve: CurveData = { t: [], raw: [], filtered: [], recovery: [] };
  const normalized = params.useReference && frames.length > 0 && frames.every((f) => !!f.ref);
  if (params.useReference && !normalized) warnings.push('No reference-patch normalization: more sensitive to lighting/white-balance changes.');

  checks.push(check('TOO_FEW_FRAMES', frames.length, '>=', g.minFrames));
  if (frames.length < Math.max(g.minFrames, 10)) return rejectEarly(input, params, checks, timing, emptyCurve, events, normalized, warnings);

  checks.push(check('LOW_FPS', timing.fps, '>=', g.minFps, 'fps'));
  checks.push(check('FRAME_DROPS', timing.dropFrac * 100, '<=', g.maxDropFrac * 100, '%'));
  checks.push(check('TIMING_JITTER', timing.jitterMs, '<=', g.maxJitterMs, 'ms'));
  if (timing.fps < 24 && timing.fps >= g.minFps) warnings.push(`Frame rate ${timing.fps.toFixed(1)} fps (<24): coarser time resolution.`);

  // --- Per-frame signal → uniform grid → zero-phase filter.
  const tr = frames.map((f) => f.t - t0);
  const sig = frames.map((f) => signalValue(params.signalKind, f.roi, normalized ? f.ref : null));
  const dt = 1 / params.fs;
  const { t, y: raw } = resampleUniform(tr, sig, 0, timing.durationS, dt);
  const sgWin = Math.max(params.sgOrder + 2, Math.round(params.sgWindowS * params.fs) | 1);
  const filtered = savgol(medianFilter(raw, params.medianWindow), sgWin, params.sgOrder);
  const curve: CurveData = { t, raw, filtered, recovery: t.map(() => null) };

  // --- Baseline.
  const bA = params.baselineGuardS;
  const bB = pressCue - params.baselineGuardS;
  checks.push(check('SHORT_BASELINE', Math.max(0, bB - bA), '>=', params.minBaselineS, 's'));
  const baseRaw = sliceByTime(t, raw, bA, bB);
  const baseFilt = sliceByTime(t, filtered, bA, bB);
  const baseFrames = frames.filter((_, i) => tr[i] >= bA && tr[i] <= bB);

  const lumaSrc = baseFrames.length ? baseFrames : frames;
  const luma = median(lumaSrc.map((f) => f.luma));
  checks.push(check('TOO_DARK', luma, '>=', g.minLuma));
  checks.push(check('TOO_BRIGHT', luma, '<=', g.maxLuma));
  checks.push(check('CLIPPING', median(frames.map((f) => f.clipFrac)) * 100, '<=', g.maxClipFrac * 100, '%'));
  const sharp = frames.filter((f) => f.sharpness !== undefined).map((f) => f.sharpness as number);
  checks.push(check('BLUR', sharp.length > frames.length / 2 ? median(sharp) : null, '>=', g.minSharpness));

  if (baseFilt.length < 3) return rejectEarly(input, params, checks, timing, curve, events, normalized, warnings);
  const baseline = median(baseFilt);
  const noiseSD = robustSD(baseRaw);
  events.baseline = baseline;
  events.noiseSD = noiseSD;

  // --- Trough & recovery onset.
  let trough: number;
  let release: number | null = null;
  const rOf = (tr0: number, amp: number) => filtered.map((v) => (amp > 0 ? (v - tr0) / amp : null));

  if (input.protocol === 'B') {
    // The ROI is covered by the operator's finger while pressing: trough = minimum right after the release cue.
    const a = lowerBound(t, releaseCue - 0.3);
    const b = lowerBound(t, releaseCue + 2.5);
    let iMin = a;
    for (let i = a; i < Math.min(b, t.length); i++) if (filtered[i] < filtered[iMin]) iMin = i;
    trough = filtered[iMin];
    release = t[iMin];
    warnings.push('Protocol B: the start of recovery is covered by the operator finger → CRT tends to be measured shorter (bias).');
  } else {
    trough = median(sliceByTime(t, filtered, releaseCue - 0.5 - params.troughWindowS, releaseCue - 0.5));
  }

  let amplitude = baseline - trough;
  const relAmp = amplitude / Math.max(Math.abs(baseline), 1e-9);
  const cnr = noiseSD > 0 ? amplitude / noiseSD : amplitude > 0 ? Infinity : 0;
  checks.push(check('NO_BLANCHING', relAmp * 100, '>=', g.minRelAmplitude * 100, '%'));
  checks.push(check('LOW_CONTRAST', Number.isFinite(cnr) ? cnr : 1e6, '>=', g.minCNR));
  events.trough = trough;
  events.amplitude = amplitude;
  if (amplitude <= 0 || relAmp < g.minRelAmplitude || cnr < g.minCNR) {
    return rejectEarly(input, params, checks, timing, curve, events, normalized, warnings);
  }

  // Median-filtered signal (no SG) for the fit: robust to spikes, without SG edge broadening.
  const mraw = medianFilter(raw, params.medianWindow);
  let r = rOf(trough, amplitude);
  if (input.protocol !== 'B') {
    const searchFrom = releaseCue - params.releaseSearchBeforeS;
    for (let pass = 0; pass < 2; pass++) {
      const cross = crossing(t, r, searchFrom, params.releaseDetectR, params.holdS, params.holdTolerance);
      if (cross === null || cross > releaseCue + params.releaseSearchAfterS) {
        release = null;
        break;
      }
      // Onset = hinge of a "plateau + rising line" fit on the data up to r ≈ onsetFitHi.
      const hi = crossing(t, r, cross, params.onsetFitHi, 0, 1) ?? cross + 1;
      const a = lowerBound(t, searchFrom - 1);
      const b = Math.min(t.length - 1, lowerBound(t, hi));
      const fit = hingeFit(t.slice(a, b + 1), mraw.slice(a, b + 1), searchFrom, cross, params.onsetModel);
      release = fit ? fit.t0 : cross;
      // Refine the trough from the window right before onset.
      const tw = sliceByTime(t, mraw, Math.max(pressCue + 0.5, release - params.troughWindowS), release - 0.1);
      if (tw.length >= 3) {
        trough = median(tw);
        amplitude = baseline - trough;
        if (amplitude <= 0) break;
        r = rOf(trough, amplitude);
      }
    }
  }
  events.trough = trough;
  events.amplitude = amplitude;
  events.release = release;
  checks.push(check('RELEASE_NOT_DETECTED', release === null ? 0 : 1, '>=', 1));
  if (release === null || amplitude <= 0) return rejectEarly(input, params, checks, timing, curve, events, normalized, warnings);
  const rel = release;
  curve.recovery = r.map((v, i) => (t[i] >= rel - 1 ? v : null));

  // --- CRT & sensitivity: crossing on the isotonic (monotone) regression of r since onset.
  const i0 = lowerBound(t, rel);
  const fitWin = Math.max(params.sgOrder + 2, Math.round(params.fitSgWindowS * params.fs) | 1);
  const fitSrc = params.fitSource === 'sg' ? (fitWin === sgWin ? filtered : savgol(mraw, fitWin, params.sgOrder)) : mraw;
  const blocks = isotonicBlocks(fitSrc.slice(i0).map((v) => (v - trough) / amplitude));
  const mids = blocks.map((bk) => ({ t: (t[i0 + bk.start] + t[i0 + bk.end]) / 2, v: bk.value }));
  const fitCurve: (number | null)[] = t.map(() => null);
  for (const bk of blocks) for (let i = bk.start; i <= bk.end; i++) fitCurve[i0 + i] = bk.value;
  curve.monotoneFit = fitCurve;
  const at = (x: number): number | null => {
    for (let k = 0; k < mids.length; k++) {
      if (mids[k].v < x) continue;
      if (k === 0) return Math.max(0, mids[0].t - rel);
      const p = mids[k - 1];
      const q = mids[k];
      return p.t + ((x - p.v) / (q.v - p.v)) * (q.t - p.t) - rel;
    }
    return null;
  };
  const crtMain = at(params.recoveryX);
  const sensitivity = params.sensitivityX.map((x) => ({ x, crt: at(x) }));
  const t50 = at(0.5);
  const tRecovery = crtMain === null ? null : rel + crtMain;
  events.recovery = tRecovery;
  const critEnd = tRecovery === null ? timing.durationS : Math.min(timing.durationS, tRecovery + 0.5);

  // --- Critical-window gates.
  const critFrames = frames.filter((_, i) => tr[i] >= rel - 0.2 && tr[i] <= critEnd);
  let maxGap = 0;
  for (let i = 1; i < critFrames.length; i++) maxGap = Math.max(maxGap, critFrames[i].t - critFrames[i - 1].t);
  checks.push(check('GAP', maxGap, '<=', g.maxGapS, 's'));

  const hasMotion = critFrames.length > 0 && critFrames.every((f) => f.dx !== undefined && f.dy !== undefined) && !!input.roiSizePx;
  let motion: number | null = null;
  if (hasMotion) {
    const f0 = critFrames[0];
    motion = Math.max(...critFrames.map((f) => Math.hypot((f.dx ?? 0) - (f0.dx ?? 0), (f.dy ?? 0) - (f0.dy ?? 0)))) / (input.roiSizePx as number);
  }
  checks.push(check('MOTION', motion === null ? null : motion * 100, '<=', g.maxMotionFrac * 100, '% ROI'));

  if (normalized) {
    const refRaw = frames.map((f) => SIGNALS[params.signalKind].value(f.ref!));
    const refRes = resampleUniform(tr, refRaw, 0, timing.durationS, dt).y;
    const refFilt = savgol(medianFilter(refRes, params.medianWindow), sgWin, params.sgOrder);
    checks.push(check('REF_DRIFT', referenceDriftRatio(params.signalKind, refFilt, amplitude, baseline), '<=', g.maxRefDriftRatio));
    const refY = resampleUniform(tr, frames.map((f) => luminance(f.ref!)), 0, timing.durationS, dt).y;
    const refYF = savgol(medianFilter(refY, params.medianWindow), sgWin, params.sgOrder);
    const medY = median(refYF);
    checks.push(check('REF_LUMA_DRIFT', ((Math.max(...refYF) - Math.min(...refYF)) / Math.max(medY, 1e-9)) * 100, '<=', g.maxRefLumaDrift * 100, '%'));
  } else {
    checks.push(check('REF_DRIFT', null, '<=', g.maxRefDriftRatio));
  }

  const recRaw = sliceByTime(t, raw, rel, critEnd);
  const recFilt = sliceByTime(t, filtered, rel, critEnd);
  const resid = recRaw.map((v, i) => v - recFilt[i]);
  checks.push(check('NOISY_RECOVERY', resid.length > 3 ? robustSD(resid) / amplitude : null, '<=', g.maxRecoveryNoiseRel));

  // Maximum reverse drop (drawdown) of the filtered curve during recovery, as a fraction of amplitude.
  const monoEnd = tRecovery ?? timing.durationS;
  const rr = sliceByTime(t, r, rel, monoEnd).filter((v): v is number => v !== null);
  let runMax = -Infinity;
  let drawdown = 0;
  for (const v of rr) {
    runMax = Math.max(runMax, v);
    drawdown = Math.max(drawdown, runMax - v);
  }
  checks.push(check('NON_MONOTONIC', rr.length > 2 ? drawdown * 100 : null, '<=', g.maxDrawdown * 100, '% amplitude'));

  const s80 = sensitivity.find((s) => s.x === 0.8)?.crt;
  const s95 = sensitivity.find((s) => s.x === 0.95)?.crt;
  if (s80 != null && s95 != null && s95 - s80 > 2) warnings.push('Flat recovery curve: the CRT value is sensitive to the recovery-threshold definition.');

  return finalize(input, params, checks, timing, curve, events, normalized, warnings, crtMain, sensitivity, t50);
}
