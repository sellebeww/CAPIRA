import { describe, expect, it } from 'vitest';
import { interpretCrt } from '../clinical/crt';
import { computeQsofa } from '../clinical/qsofa';
import { buildRecommendation } from '../clinical/recommendation';
import { analyzeCapture } from '../engine/analyze';
import { synthesize } from '../engine/synthetic';
import { MOCK_FACILITIES } from './facilities';
import { buildReferralText, buildSmsText, type ReferralInput } from './template';

function input(over: Partial<ReferralInput> = {}): ReferralInput {
  const { input: cap } = synthesize({ seed: 2, crtS: 2, skin: 'light', noiseSD: 0.0008 });
  const crt = analyzeCapture(cap);
  const qsofa = computeQsofa({ rr: 24, gcs: 15, sbp: 98, ageYears: 45 });
  const crtInterp = interpretCrt(crt, { ageYears: 45 });
  return {
    patientLabel: 'Mr. A',
    ageYears: 45,
    sex: 'M',
    vitals: { rr: 24, sbp: 98, dbp: 60, gcs: 15, hr: 112, tempC: 38.9, spo2: 95 },
    context: {},
    qsofa,
    crt,
    crtInterp,
    recommendation: buildRecommendation(qsofa, crtInterp),
    facility: MOCK_FACILITIES[0],
    time: new Date(2026, 8, 30, 14, 5),
    simulated: false,
    ...over,
  };
}

describe('referral draft (deterministic template)', () => {
  it('deterministic: same input → same text', () => {
    const a = input();
    expect(buildReferralText(a)).toBe(buildReferralText(a));
  });
  it('contains all required sections', () => {
    const t = buildReferralText(input());
    for (const s of ['IDENTITY', 'VITAL SIGNS', 'qSOFA', 'CAPILLARY REFILL TIME', 'Protocol', 'Data quality', 'SUMMARY', '30/09/2026 14:05', 'MOCK', 'not a validated medical device'])
      expect(t).toContain(s);
    expect(t).toContain('a score <2 does not mean the patient is safe');
    expect(t).toContain('not part of the qSOFA score');
  });
  it('simulation mode is clearly labelled', () => {
    expect(buildReferralText(input({ simulated: true }))).toMatch(/^\*\*\* SIMULATION/);
    expect(buildSmsText(input({ simulated: true }))).toMatch(/^\[SIMULATION\]/);
  });
  it('does not name a diagnosis', () => {
    const t = buildReferralText(input()).toLowerCase();
    expect(t).not.toMatch(/\bshock\b|critical/);
    // "sepsis" may only appear as the guideline name "Sepsis-3".
    expect(t.replace(/sepsis-3/g, '')).not.toMatch(/sepsis/);
  });
  it('compact SMS (≤ 3 segments ≈ 459 characters)', () => {
    expect(buildSmsText(input()).length).toBeLessThanOrEqual(459);
  });
  it('empty values are shown as "—", not 0', () => {
    const t = buildReferralText(input({ vitals: { rr: 24, sbp: 98, gcs: 15 } }));
    expect(t).toContain('Pulse: —');
  });
  it('manual CRT is labelled subjective', () => {
    expect(buildReferralText(input({ manualCrtS: 3 }))).toMatch(/Manual CRT \(subjective/);
  });
});
