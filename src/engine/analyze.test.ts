import { describe, expect, it } from 'vitest';
import { analyzeCapture } from './analyze';
import { withParams } from './params';
import { synthesize, type SynthOptions } from './synthetic';
import type { CheckCode, CrtResult } from './types';

function run(opts: SynthOptions, params = withParams()) {
  const { input, truth } = synthesize({ seed: 11, ...opts });
  return { res: analyzeCapture(input, params), truth, input };
}

function failed(res: CrtResult): CheckCode[] {
  return res.checks.filter((c) => !c.pass).map((c) => c.code);
}

/**
 * The tolerance thresholds here come from the `npm run accuracy` sweep (docs/VALIDATION.md) — not magic numbers:
 * under clean conditions (high CNR) the CRT@0.9 error is generally < 0.3 s; the tests use 0.35 s as the limit.
 */
describe('accuracy on clean synthetic signals', () => {
  for (const crtS of [1, 2, 3, 4, 6]) {
    it(`CRT ${crtS} s (exponential, light skin, low noise)`, () => {
      const { res, truth } = run({ crtS, skin: 'light', noiseSD: 0.0008 });
      expect(res.status).toBe('ok');
      const tr = truth.crtAt(0.9)!;
      expect(Math.abs(res.crt! - tr)).toBeLessThan(0.35);
      // t50 is more robust.
      expect(Math.abs(res.t50! - truth.crtAt(0.5)!)).toBeLessThan(0.2);
    });
  }

  it('release onset is detected close to the actual release time', () => {
    const { res, truth } = run({ crtS: 2.5, skin: 'light', noiseSD: 0.0008 });
    expect(Math.abs(res.events.release! - truth.releaseS)).toBeLessThan(0.15);
  });

  it('sensitivity: CRT@0.8 < CRT@0.9 < CRT@0.95', () => {
    const { res } = run({ crtS: 3, skin: 'light', noiseSD: 0.0008 });
    const [a, b, c] = res.sensitivity.map((s) => s.crt!);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('does not depend on the absolute timeline offset', () => {
    const a = run({ crtS: 2.5, skin: 'light', noiseSD: 0.0008 }).res;
    const b = run({ crtS: 2.5, skin: 'light', noiseSD: 0.0008, tOffset: 12345.678 }).res;
    expect(b.crt!).toBeCloseTo(a.crt!, 6);
  });
});

describe('robust to realistic disturbances', () => {
  it('timestamp jitter of 5 ms + 5% dropped frames', () => {
    const { res, truth } = run({ crtS: 2.5, skin: 'light', noiseSD: 0.0008, jitterMs: 5, dropProb: 0.05 });
    expect(res.status).toBe('ok');
    expect(Math.abs(res.crt! - truth.crtAt(0.9)!)).toBeLessThan(0.4);
  });

  it('frame rate 24 fps (does not assume 30 fps)', () => {
    const { res, truth } = run({ crtS: 2.5, skin: 'light', noiseSD: 0.0008, fps: 24 });
    expect(res.status).toBe('ok');
    expect(res.timing.fps).toBeGreaterThan(23);
    expect(res.timing.fps).toBeLessThan(25);
    expect(Math.abs(res.crt! - truth.crtAt(0.9)!)).toBeLessThan(0.4);
  });

  it('small auto-exposure drift is compensated by the reference patch', () => {
    const { res, truth } = run({ crtS: 3, skin: 'light', noiseSD: 0.0008, gainDriftPerS: 0.005 });
    expect(res.status).toBe('ok');
    expect(res.normalized).toBe(true);
    expect(Math.abs(res.crt! - truth.crtAt(0.9)!)).toBeLessThan(0.35);
  });

  it('no reference → still runs but gives a warning', () => {
    const { res } = run({ crtS: 2.5, skin: 'light', noiseSD: 0.0008, withReference: false });
    expect(res.normalized).toBe(false);
    expect(res.warnings.join(' ')).toMatch(/reference/i);
  });

  it('heartbeat pulsation (PPG 2%) does not break the measurement', () => {
    const { res, truth } = run({ crtS: 2.5, skin: 'light', noiseSD: 0.0008, ppgAmp: 0.02 });
    expect(res.status).toBe('ok');
    expect(Math.abs(res.crt! - truth.crtAt(0.9)!)).toBeLessThan(0.45);
  });
});

describe('quality gate: rejects, does not guess (fail safely)', () => {
  const cases: [string, SynthOptions, CheckCode][] = [
    ['dark', { brightness: 0.01 }, 'TOO_DARK'],
    ['saturated pixels', { clipFrac: 0.3 }, 'CLIPPING'],
    ['blurry', { sharpness: 1 }, 'BLUR'],
    ['no blanching', { blanchDepth: 0 }, 'NO_BLANCHING'],
    ['high noise', { noiseSD: 0.03 }, 'LOW_CONTRAST'],
    ['not released', { noRelease: true }, 'RELEASE_NOT_DETECTED'],
    ['moving during recovery', { motion: { atS: 13, px: 40 } }, 'MOTION'],
    ['white balance drifting', { wbDriftR: 0.3 }, 'REF_DRIFT'],
    ['large auto-exposure drift', { gainDriftPerS: 0.03 }, 'REF_LUMA_DRIFT'],
    ['frame rate too low', { fps: 12 }, 'LOW_FPS'],
    ['many dropped frames', { dropProb: 0.3 }, 'FRAME_DROPS'],
    ['large jitter', { jitterMs: 25 }, 'TIMING_JITTER'],
    ['baseline too short', { baselineS: 0.6 }, 'SHORT_BASELINE'],
  ];
  for (const [name, opts, code] of cases) {
    it(`${name} → ${code}`, () => {
      const { res } = run({ crtS: 2.5, skin: 'light', noiseSD: 0.0008, ...opts });
      expect(res.status).toBe('rejected');
      expect(res.crt).toBeNull();
      expect(res.sensitivity).toEqual([]);
      expect(res.t50).toBeNull();
      expect(failed(res)).toContain(code);
      expect(res.reasons.length).toBeGreaterThan(0);
    });
  }

  it('dark skin with medium noise is honestly rejected (low contrast), not given a number', () => {
    const { res } = run({ crtS: 2.5, skin: 'dark', noiseSD: 0.003 });
    expect(res.status).toBe('rejected');
    expect(failed(res)).toContain('LOW_CONTRAST');
  });

  it('too few frames → rejected without crashing', () => {
    const { input } = synthesize({ seed: 1 });
    const res = analyzeCapture({ ...input, frames: input.frames.slice(0, 20) });
    expect(res.status).toBe('rejected');
    expect(failed(res)).toContain('TOO_FEW_FRAMES');
  });

  it('empty input → rejected without crashing', () => {
    const res = analyzeCapture({ frames: [], markers: { pressCue: 2, releaseCue: 12 }, protocol: 'A' });
    expect(res.status).toBe('rejected');
  });
});

describe('censored & protocol', () => {
  it('CRT exceeds the window → "censored", not a number', () => {
    const { res } = run({ crtS: 14, skin: 'light', noiseSD: 0.0008 });
    expect(res.status).toBe('censored');
    expect(res.crt).toBeNull();
    expect(res.censoredAboveS!).toBeGreaterThan(9);
  });

  it('protocol B gives a bias warning', () => {
    const { res } = run({ crtS: 3, skin: 'light', noiseSD: 0.0008, protocol: 'B' });
    expect(res.warnings.join(' ')).toMatch(/Protocol B/);
  });

  for (const kind of ['rg', 'astar', 'hue', 'sat', 'gInv'] as const) {
    it(`signal ${kind}: consistent with its own signal-space ground truth`, () => {
      const { input, truth } = synthesize({ seed: 5, crtS: 2.5, skin: 'light', noiseSD: 0.0005, ppgAmp: 0 });
      const res = analyzeCapture(input, withParams({ signalKind: kind, gates: { minCNR: 0 } }));
      expect(res.status).toBe('ok');
      expect(Math.abs(res.crt! - truth.crtAt(0.9, kind)!)).toBeLessThan(0.35);
    });
  }
});
