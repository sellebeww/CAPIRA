import { describe, expect, it } from 'vitest';
import { analyzeCapture } from '../engine/analyze';
import { synthesize } from '../engine/synthetic';
import type { CrtResult } from '../engine/types';
import { ageGroupOf, interpretCrt } from './crt';
import { computeQsofa, QSOFA_CHILD_NOTE, QSOFA_OBSTETRIC_WARNING } from './qsofa';
import { buildRecommendation, NON_DIRECTIVE } from './recommendation';

const ADULT = 40;

describe('qSOFA — all combinations at boundary values', () => {
  for (const rr of [21, 22])
    for (const gcs of [15, 14])
      for (const sbp of [101, 100]) {
        const expected = (rr >= 22 ? 1 : 0) + (gcs < 15 ? 1 : 0) + (sbp <= 100 ? 1 : 0);
        it(`RR ${rr}, GCS ${gcs}, systolic ${sbp} → ${expected}`, () => {
          const q = computeQsofa({ rr, gcs, sbp, ageYears: ADULT });
          expect(q.status).toBe('complete');
          expect(q.score).toBe(expected);
          expect(q.elevated).toBe(expected >= 2);
          if (expected >= 2) expect(q.headline).toContain('increased risk of poor outcome');
          else expect(q.headline).not.toContain('increased risk');
        });
      }

  it('valid extreme values at range edges', () => {
    expect(computeQsofa({ rr: 0, gcs: 3, sbp: 30, ageYears: ADULT }).score).toBe(2);
    expect(computeQsofa({ rr: 80, gcs: 15, sbp: 300, ageYears: ADULT }).score).toBe(1);
  });
});

describe('qSOFA — incomplete input is NOT counted as 0', () => {
  it('all empty', () => {
    const q = computeQsofa({ ageYears: ADULT });
    expect(q.status).toBe('incomplete');
    expect(q.score).toBeNull();
    expect(q.minPossible).toBe(0);
    expect(q.maxPossible).toBe(3);
    expect(q.elevated).toBe(false);
  });
  it('1 criterion met, 2 empty → cannot be concluded yet', () => {
    const q = computeQsofa({ rr: 30, ageYears: ADULT });
    expect(q.status).toBe('incomplete');
    expect(q.score).toBeNull();
    expect(q.headline).toContain('cannot be concluded yet');
    expect([q.minPossible, q.maxPossible]).toEqual([1, 3]);
  });
  it('2 criteria met, 1 empty → already ≥2 (concluded from the available data)', () => {
    const q = computeQsofa({ rr: 30, sbp: 90, ageYears: ADULT });
    expect(q.status).toBe('incomplete');
    expect(q.score).toBeNull();
    expect(q.elevated).toBe(true);
  });
  it('2 criteria not met, 1 empty → still incomplete (score could be 0 or 1)', () => {
    const q = computeQsofa({ rr: 16, sbp: 120, ageYears: ADULT });
    expect(q.status).toBe('incomplete');
    expect([q.minPossible, q.maxPossible]).toEqual([0, 1]);
  });
  it('NaN is treated as empty', () => {
    expect(computeQsofa({ rr: NaN, gcs: 15, sbp: 120, ageYears: ADULT }).status).toBe('incomplete');
  });
});

describe('qSOFA — range validation', () => {
  const bad: [string, Parameters<typeof computeQsofa>[0]][] = [
    ['RR 81', { rr: 81, gcs: 15, sbp: 120 }],
    ['RR -1', { rr: -1, gcs: 15, sbp: 120 }],
    ['systolic 29', { rr: 16, gcs: 15, sbp: 29 }],
    ['systolic 301', { rr: 16, gcs: 15, sbp: 301 }],
    ['GCS 2', { rr: 16, gcs: 2, sbp: 120 }],
    ['GCS 16', { rr: 16, gcs: 16, sbp: 120 }],
    ['GCS 14.5', { rr: 16, gcs: 14.5, sbp: 120 }],
  ];
  for (const [name, input] of bad) {
    it(`${name} → invalid, no score`, () => {
      const q = computeQsofa({ ...input, ageYears: ADULT });
      expect(q.status).toBe('invalid');
      expect(q.score).toBeNull();
      expect(q.criteria.some((c) => c.error)).toBe(true);
    });
  }
});

describe('qSOFA — population', () => {
  it('child → not applicable', () => {
    const q = computeQsofa({ rr: 40, gcs: 13, sbp: 80, ageYears: 10 });
    expect(q.status).toBe('not_applicable');
    expect(q.score).toBeNull();
    expect(q.headline).toBe(QSOFA_CHILD_NOTE);
  });
  it('age boundary 18 = adult', () => {
    expect(computeQsofa({ rr: 16, gcs: 15, sbp: 120, ageYears: 18 }).status).toBe('complete');
    expect(computeQsofa({ rr: 16, gcs: 15, sbp: 120, ageYears: 17.9 }).status).toBe('not_applicable');
  });
  it('pregnant/postpartum → not-validated warning', () => {
    const q = computeQsofa({ rr: 16, gcs: 15, sbp: 120, ageYears: 28, obstetric: true });
    expect(q.warnings).toContain(QSOFA_OBSTETRIC_WARNING);
  });
  it('empty age → computed with a warning', () => {
    const q = computeQsofa({ rr: 16, gcs: 15, sbp: 120 });
    expect(q.status).toBe('complete');
    expect(q.warnings.join(' ')).toMatch(/Age not entered/);
  });
});

function okResult(crt: number, s80: number, s95: number | null): CrtResult {
  const { input } = synthesize({ seed: 1, skin: 'light', noiseSD: 0.0008 });
  const base = analyzeCapture(input);
  return {
    ...base,
    status: 'ok',
    crt,
    sensitivity: [
      { x: 0.8, crt: s80 },
      { x: 0.9, crt },
      { x: 0.95, crt: s95 },
    ],
  };
}

describe('CRT interpretation', () => {
  it('age groups', () => {
    expect(ageGroupOf(5)).toBe('child');
    expect(ageGroupOf(18)).toBe('adult');
    expect(ageGroupOf(null)).toBe('unknown');
  });
  it('adult: 3.0 s is not prolonged, 3.1 is prolonged (threshold >3)', () => {
    expect(interpretCrt(okResult(3.0, 2.5, 3.0), { ageYears: 40 }).status).toBe('within_limit');
    expect(interpretCrt(okResult(3.1, 3.05, 3.5), { ageYears: 40 }).status).toBe('prolonged');
  });
  it('child: threshold 2 s', () => {
    const i = interpretCrt(okResult(2.4, 2.1, 2.8), { ageYears: 6 });
    expect(i.status).toBe('prolonged');
    expect(i.thresholdS).toBe(2);
  });
  it('wording never says "shock" or "sepsis"', () => {
    for (const r of [okResult(5, 4, 6), okResult(1.5, 1.2, 1.8)]) {
      const i = interpretCrt(r, { ageYears: 40, cold: true });
      expect((i.headline + i.warnings.join(' ')).toLowerCase()).not.toMatch(/shock|sepsis/);
    }
  });
  it('near threshold when the sensitivity range straddles the threshold', () => {
    expect(interpretCrt(okResult(2.9, 2.5, 3.4), { ageYears: 40 }).nearThreshold).toBe(true);
    expect(interpretCrt(okResult(1.5, 1.2, 1.8), { ageYears: 40 }).nearThreshold).toBe(false);
  });
  it('rejected → Low Data Quality, no number', () => {
    const i = interpretCrt({ ...okResult(2, 1.8, 2.2), status: 'rejected', crt: null }, { ageYears: 40 });
    expect(i.status).toBe('low_quality');
    expect(i.displayValueS).toBeNull();
    expect(i.headline).toMatch(/Low Data Quality/);
  });
  it('censored → prolonged without a guessed number', () => {
    const i = interpretCrt({ ...okResult(2, 1.8, 2.2), status: 'censored', crt: null, censoredAboveS: 9.7 }, { ageYears: 40 });
    expect(i.status).toBe('prolonged');
    expect(i.displayValueS).toBeNull();
  });
  it('cold context & hand not at heart level add warnings', () => {
    const i = interpretCrt(okResult(2, 1.8, 2.2), { ageYears: 40, cold: true, handAtHeartLevel: false });
    expect(i.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('non-directive recommendation', () => {
  it('always includes the non-directive sentence and never names a diagnosis', () => {
    const cases = [
      [computeQsofa({ rr: 30, gcs: 13, sbp: 90, ageYears: 50 }), interpretCrt(okResult(4, 3.5, 4.5), { ageYears: 50 })],
      [computeQsofa({ rr: 14, gcs: 15, sbp: 130, ageYears: 50 }), interpretCrt(okResult(1.5, 1.2, 1.8), { ageYears: 50 })],
      [computeQsofa({ ageYears: 50 }), interpretCrt(null, { ageYears: 50 })],
    ] as const;
    for (const [q, c] of cases) {
      const r = buildRecommendation(q, c);
      expect(r.text).toContain(NON_DIRECTIVE);
      expect(r.text.toLowerCase()).not.toMatch(/shock|sepsis|critical/);
    }
  });
  it('with no findings, still states that a serious condition is not ruled out', () => {
    const r = buildRecommendation(computeQsofa({ rr: 14, gcs: 15, sbp: 130, ageYears: 50 }), interpretCrt(okResult(1.5, 1.2, 1.8), { ageYears: 50 }));
    expect(r.findings).toEqual([]);
    expect(r.text).toMatch(/does not rule out/);
  });
});
