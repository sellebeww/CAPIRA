import type { CrtInterpretation } from './crt';
import type { QsofaResult } from './qsofa';

export const NON_DIRECTIVE =
  'Consider further evaluation/referral according to local protocol and clinical judgment.';

export const DISCLAIMER = 'Research prototype, not a validated medical device; not a substitute for clinical judgment.';

export interface Recommendation {
  findings: string[];
  text: string;
}

/** Non-directive recommendation. Never names a diagnosis ("sepsis"/"shock") or orders an action. */
export function buildRecommendation(q: QsofaResult, c: CrtInterpretation): Recommendation {
  const findings: string[] = [];
  if (q.elevated) findings.push(q.status === 'complete' ? `qSOFA ${q.score}/3 (≥2)` : `≥2 qSOFA criteria met (incomplete data)`);
  if (c.status === 'prolonged') findings.push('Prolonged CRT');
  if (c.nearThreshold) findings.push('CRT near threshold');

  const gaps: string[] = [];
  if (q.status === 'incomplete') gaps.push('qSOFA data incomplete');
  if (q.status === 'invalid') gaps.push('some qSOFA input is invalid');
  if (c.status === 'low_quality') gaps.push('CRT not measured (low data quality)');

  const parts: string[] = [];
  if (findings.length) parts.push(`Findings needing attention: ${findings.join('; ')}.`);
  else parts.push('No qSOFA ≥2 or prolonged CRT finding in this assessment; this does not rule out a serious condition.');
  if (gaps.length) parts.push(`Limitations: ${gaps.join('; ')}.`);
  parts.push(NON_DIRECTIVE);
  return { findings, text: parts.join(' ') };
}
