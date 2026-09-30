import type { CrtResult } from '../engine/types';
import { ADULT_AGE_YEARS } from './qsofa';

/**
 * CRT thresholds (per age group; sources in docs/CLAIMS.md):
 *  - Adult: >3 s is considered prolonged (ANDROMEDA-SHOCK threshold).
 *  - Child (>7 days): upper limit of normal ~2 s at the finger (Fleming 2015); many guidelines use ≥3 s as abnormal.
 * Wording: "Prolonged CRT" — NEVER "shock"/"sepsis".
 */
export const CRT_THRESHOLDS_S = { adult: 3, child: 2 } as const;
export const ELDERLY_AGE_YEARS = 65;

export type AgeGroup = 'adult' | 'child' | 'unknown';

export function ageGroupOf(ageYears: number | null | undefined): AgeGroup {
  if (ageYears === null || ageYears === undefined || Number.isNaN(ageYears)) return 'unknown';
  return ageYears < ADULT_AGE_YEARS ? 'child' : 'adult';
}

export interface CrtContext {
  ageYears?: number | null;
  /** Room or patient's hand is cold. */
  cold?: boolean;
  /** Hand positioned at heart level (per protocol). */
  handAtHeartLevel?: boolean;
}

export type CrtInterpretationStatus = 'prolonged' | 'within_limit' | 'no_threshold' | 'low_quality';

export interface CrtInterpretation {
  status: CrtInterpretationStatus;
  /** Display value (rounded to 0.1 s); null when there is no number. */
  displayValueS: number | null;
  thresholdS: number | null;
  ageGroup: AgeGroup;
  headline: string;
  /** The sensitivity range (CRT@0.8 – CRT@0.95) straddles the threshold. */
  nearThreshold: boolean;
  warnings: string[];
}

const fmt = (v: number) => v.toFixed(1);

export function interpretCrt(result: CrtResult | null, ctx: CrtContext): CrtInterpretation {
  const ageGroup = ageGroupOf(ctx.ageYears);
  const thresholdS = ageGroup === 'unknown' ? null : CRT_THRESHOLDS_S[ageGroup];
  const warnings: string[] = [];
  if (ctx.cold) warnings.push('A cold room/hand can prolong CRT. Warm the hand and repeat if possible.');
  if (ctx.handAtHeartLevel === false) warnings.push('Hand not at heart level: hand position affects CRT.');
  if (ctx.ageYears != null && ctx.ageYears >= ELDERLY_AGE_YEARS) warnings.push('In the elderly, normal CRT tends to be longer; interpret together with other clinical findings.');
  if (ageGroup === 'unknown') warnings.push('Age not entered: the CRT threshold (adult 3 s / child 2 s) cannot be applied.');

  if (!result || result.status === 'rejected') {
    return {
      status: 'low_quality',
      displayValueS: null,
      thresholdS,
      ageGroup,
      headline: 'Low Data Quality — CRT could not be measured reliably',
      nearThreshold: false,
      warnings,
    };
  }

  if (result.status === 'censored') {
    const w = result.censoredAboveS ?? 0;
    return {
      status: thresholdS === null ? 'no_threshold' : 'prolonged',
      displayValueS: null,
      thresholdS,
      ageGroup,
      headline: thresholdS === null ? `Did not recover within ${fmt(w)} s (CRT > ${fmt(w)} s)` : `Prolonged CRT: did not recover within ${fmt(w)} s`,
      nearThreshold: false,
      warnings,
    };
  }

  const v = Math.round((result.crt as number) * 10) / 10;
  const s80 = result.sensitivity.find((s) => s.x === 0.8)?.crt ?? null;
  const s95 = result.sensitivity.find((s) => s.x === 0.95)?.crt ?? null;
  const nearThreshold =
    thresholdS !== null && s80 !== null && (s95 === null ? s80 <= thresholdS : s80 <= thresholdS && s95 > thresholdS);
  if (nearThreshold) warnings.push('Near the threshold: the result changes category depending on the recovery definition (see sensitivity analysis). Consider repeating the measurement.');

  if (thresholdS === null) {
    return { status: 'no_threshold', displayValueS: v, thresholdS, ageGroup, headline: `CRT ${fmt(v)} s`, nearThreshold, warnings };
  }
  const prolonged = v > thresholdS;
  return {
    status: prolonged ? 'prolonged' : 'within_limit',
    displayValueS: v,
    thresholdS,
    ageGroup,
    headline: prolonged ? `Prolonged CRT: ${fmt(v)} s (> ${thresholdS} s)` : `CRT ${fmt(v)} s (≤ ${thresholdS} s)`,
    nearThreshold,
    warnings,
  };
}
