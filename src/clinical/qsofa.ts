/**
 * qSOFA (Singer et al., JAMA 2016; Sepsis-3) — deterministic, not AI.
 * Criteria: respiratory rate ≥22/min; altered mental status (GCS <15); systolic blood pressure ≤100 mmHg.
 * A PROGNOSTIC stratification tool for patients with suspected infection outside the ICU — not a sepsis diagnostic tool.
 * SSC 2021 (Evans et al.) does not recommend qSOFA as a single screening tool.
 */

export const ADULT_AGE_YEARS = 18;

export const QSOFA_RANGES = {
  rr: { min: 0, max: 80, unit: '/min' },
  sbp: { min: 30, max: 300, unit: 'mmHg' },
  gcs: { min: 3, max: 15, unit: '' },
} as const;

export const QSOFA_PERMANENT_NOTE = 'A score <2 does not mean the patient is safe.';
export const QSOFA_SCOPE_NOTE =
  'qSOFA is a prognostic stratification tool for adults with suspected infection, not a sepsis diagnostic tool, and is not recommended as a single screening tool (Surviving Sepsis Campaign 2021).';
export const QSOFA_OBSTETRIC_WARNING =
  'Standard qSOFA has not been validated for pregnancy/postpartum. Obstetric criteria (e.g. omqSOFA: RR ≥25, systolic <90, altered mental status) use different thresholds — follow local protocol.';
export const QSOFA_CHILD_NOTE = 'qSOFA does not apply to children.';

export interface QsofaInput {
  rr?: number | null;
  sbp?: number | null;
  gcs?: number | null;
  ageYears?: number | null;
  obstetric?: boolean;
}

export type CriterionKey = 'rr' | 'sbp' | 'gcs';

export interface Criterion {
  key: CriterionKey;
  label: string;
  rule: string;
  value: number | null;
  /** null = not assessed (empty/invalid). */
  met: boolean | null;
  error?: string;
}

export type QsofaStatus = 'complete' | 'incomplete' | 'invalid' | 'not_applicable';

export interface QsofaResult {
  status: QsofaStatus;
  /** Only when status is 'complete'. */
  score: number | null;
  metCount: number;
  assessedCount: number;
  /** Possible score range when some criteria are not yet assessed. */
  minPossible: number;
  maxPossible: number;
  /** true when (complete and score ≥2) or (incomplete but already ≥2 criteria met). */
  elevated: boolean;
  criteria: Criterion[];
  headline: string;
  warnings: string[];
}

function validate(key: CriterionKey, v: number | null | undefined): { value: number | null; error?: string } {
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return { value: null };
  const r = QSOFA_RANGES[key];
  if (!Number.isFinite(v) || v < r.min || v > r.max) return { value: null, error: `Outside the valid range (${r.min}–${r.max}${r.unit ? ' ' + r.unit : ''}).` };
  if (key === 'gcs' && !Number.isInteger(v)) return { value: null, error: 'GCS must be an integer from 3 to 15.' };
  return { value: v };
}

export function computeQsofa(input: QsofaInput): QsofaResult {
  const warnings: string[] = [];
  const rr = validate('rr', input.rr);
  const sbp = validate('sbp', input.sbp);
  const gcs = validate('gcs', input.gcs);
  const criteria: Criterion[] = [
    { key: 'rr', label: 'Respiratory rate', rule: '≥ 22 /min', value: rr.value, met: rr.value === null ? null : rr.value >= 22, error: rr.error },
    { key: 'gcs', label: 'Mental status', rule: 'GCS < 15', value: gcs.value, met: gcs.value === null ? null : gcs.value < 15, error: gcs.error },
    { key: 'sbp', label: 'Systolic blood pressure', rule: '≤ 100 mmHg', value: sbp.value, met: sbp.value === null ? null : sbp.value <= 100, error: sbp.error },
  ];
  const assessed = criteria.filter((c) => c.met !== null);
  const metCount = criteria.filter((c) => c.met === true).length;
  const missing = criteria.length - assessed.length;
  const base = {
    metCount,
    assessedCount: assessed.length,
    minPossible: metCount,
    maxPossible: metCount + missing,
    criteria,
  };

  if (input.ageYears === null || input.ageYears === undefined || Number.isNaN(input.ageYears)) {
    warnings.push('Age not entered: qSOFA applies to adults only.');
  } else if (input.ageYears < ADULT_AGE_YEARS) {
    return { ...base, status: 'not_applicable', score: null, elevated: false, headline: QSOFA_CHILD_NOTE, warnings: [] };
  }
  if (input.obstetric) warnings.push(QSOFA_OBSTETRIC_WARNING);

  if (criteria.some((c) => c.error)) {
    return {
      ...base,
      status: 'invalid',
      score: null,
      elevated: false,
      headline: 'Invalid input — check the flagged values.',
      warnings,
    };
  }

  if (missing === 0) {
    const elevated = metCount >= 2;
    return {
      ...base,
      status: 'complete',
      score: metCount,
      elevated,
      headline: elevated ? `qSOFA score ${metCount}/3 — Score ≥2: increased risk of poor outcome` : `qSOFA score ${metCount}/3`,
      warnings,
    };
  }

  const elevated = metCount >= 2;
  return {
    ...base,
    status: 'incomplete',
    score: null,
    elevated,
    headline: elevated
      ? `Incomplete (${assessed.length}/3 assessed) — ${metCount} criteria already met: increased risk of poor outcome`
      : `Incomplete (${assessed.length}/3 assessed) — score cannot be concluded yet (possibly ${metCount}–${metCount + missing})`,
    warnings,
  };
}
