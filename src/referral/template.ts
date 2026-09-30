import type { CrtInterpretation } from '../clinical/crt';
import type { QsofaResult } from '../clinical/qsofa';
import { DISCLAIMER, type Recommendation } from '../clinical/recommendation';
import type { CrtResult } from '../engine/types';
import { SIGNALS } from '../engine/signals';
import type { Facility } from './facilities';

/**
 * DETERMINISTIC referral-draft generator (template, offline, no LLM).
 * Content comes only from user input and computed results — no invented text.
 */
export interface ReferralVitals {
  rr?: number | null;
  sbp?: number | null;
  dbp?: number | null;
  gcs?: number | null;
  hr?: number | null;
  tempC?: number | null;
  spo2?: number | null;
}

export interface ReferralInput {
  patientLabel: string;
  ageYears?: number | null;
  sex?: 'M' | 'F' | null;
  complaint?: string;
  vitals: ReferralVitals;
  context: { cold?: boolean; handAtHeartLevel?: boolean; obstetric?: boolean };
  qsofa: QsofaResult;
  crt: CrtResult | null;
  crtInterp: CrtInterpretation;
  manualCrtS?: number | null;
  recommendation: Recommendation;
  facility?: Facility | null;
  senderName?: string;
  senderFacility?: string;
  time: Date;
  simulated: boolean;
}

const PROTOCOL_LABEL: Record<string, string> = {
  A: 'A — press the fingertip pad with clear glass/plastic',
  B: 'B — non-contact (press with a finger, then release)',
  C: 'C — lens contact + torch',
};

const n = (v: number | null | undefined, unit = '') => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${String(v)}${unit}`);
const dec = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d));

export function formatTime(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function crtLines(i: ReferralInput): string[] {
  const out: string[] = [];
  out.push(`- Result: ${i.crtInterp.headline}`);
  if (i.crt && i.crt.status !== 'rejected') {
    const s = i.crt.sensitivity.map((x) => `X=${x.x}: ${x.crt === null ? 'not reached' : dec(x.crt) + ' s'}`).join('; ');
    out.push(`- Sensitivity analysis: ${s}; t50 ${dec(i.crt.t50)} s`);
  }
  if (i.crt) {
    const failed = i.crt.checks.filter((c) => !c.pass);
    out.push(`- Data quality: ${failed.length ? 'LOW — ' + failed.map((c) => c.label).join(', ') : `passed ${i.crt.checks.length} quality checks`}`);
    out.push(`- Protocol: ${PROTOCOL_LABEL[i.crt.protocol] ?? i.crt.protocol}; signal ${SIGNALS[i.crt.signalKind].label}${i.crt.normalized ? ' (normalized to the reference skin)' : ''}`);
  }
  if (i.crtInterp.thresholdS !== null) out.push(`- Threshold used: > ${i.crtInterp.thresholdS} s (${i.crtInterp.ageGroup})`);
  if (i.manualCrtS != null) out.push(`- Manual CRT (subjective, counted by the nurse): ${dec(i.manualCrtS)} s`);
  return out;
}

export function buildReferralText(i: ReferralInput): string {
  const L: string[] = [];
  if (i.simulated) L.push('*** SIMULATION — NOT REAL PATIENT DATA ***', '');
  L.push('REFERRAL DRAFT — CAPIRA');
  L.push(`Assessment time: ${formatTime(i.time)}`);
  if (i.senderName || i.senderFacility) L.push(`Sender: ${[i.senderName, i.senderFacility].filter(Boolean).join(', ')}`);
  if (i.facility) L.push(`Destination: ${i.facility.name} — ${i.facility.type}; ${i.facility.distanceKm} km, ${i.facility.travel}`);
  L.push('');
  L.push('IDENTITY');
  L.push(`- Patient: ${i.patientLabel || '—'}; age ${n(i.ageYears, ' y')}; sex ${i.sex ?? '—'}`);
  if (i.complaint) L.push(`- Complaint/context: ${i.complaint}`);
  L.push('');
  L.push('VITAL SIGNS');
  const v = i.vitals;
  L.push(`- BP: ${n(v.sbp)}/${n(v.dbp)} mmHg; Pulse: ${n(v.hr, '/min')}; RR: ${n(v.rr, '/min')}; Temp: ${n(v.tempC, ' °C')}; SpO2: ${n(v.spo2, '%')}; GCS: ${n(v.gcs)}`);
  L.push('');
  L.push('qSOFA (Sepsis-3; prognostic, not a diagnosis)');
  L.push(`- ${i.qsofa.headline}`);
  for (const c of i.qsofa.criteria) L.push(`  • ${c.label} ${c.rule}: ${c.met === null ? 'not assessed' : c.met ? 'YES' : 'no'} (${n(c.value)})`);
  L.push('- Note: a score <2 does not mean the patient is safe.');
  L.push('');
  L.push('CAPILLARY REFILL TIME (separate supporting finding; not part of the qSOFA score)');
  L.push(...crtLines(i));
  L.push('');
  const ctx: string[] = [];
  if (i.context.cold) ctx.push('cold room/hand');
  if (i.context.handAtHeartLevel === false) ctx.push('hand not at heart level');
  if (i.context.obstetric) ctx.push('pregnant/postpartum (standard qSOFA has not been validated for obstetrics)');
  const warnings = [...i.qsofa.warnings, ...i.crtInterp.warnings];
  if (ctx.length || warnings.length) {
    L.push('CONTEXT & WARNINGS');
    if (ctx.length) L.push(`- Context: ${ctx.join('; ')}`);
    for (const w of [...new Set(warnings)]) L.push(`- ${w}`);
    L.push('');
  }
  L.push('SUMMARY');
  L.push(i.recommendation.text);
  L.push('');
  L.push(`[${DISCLAIMER}]`);
  return L.join('\n');
}

/** Compact SMS version (target ≤ 3 segments ≈ 450 characters). */
export function buildSmsText(i: ReferralInput): string {
  const v = i.vitals;
  const q = i.qsofa.status === 'complete' ? `qSOFA ${i.qsofa.score}/3` : i.qsofa.status === 'not_applicable' ? 'qSOFA n/a (child)' : `qSOFA incomplete${i.qsofa.elevated ? ' (>=2 met)' : ''}`;
  const c =
    i.crtInterp.status === 'low_quality'
      ? 'CRT: low data quality'
      : i.crtInterp.displayValueS !== null
        ? `CRT ${dec(i.crtInterp.displayValueS)}s${i.crtInterp.status === 'prolonged' ? ' PROLONGED' : ''}`
        : 'CRT prolonged (no recovery within window)';
  const parts = [
    i.simulated ? '[SIMULATION]' : '',
    `CAPIRA ${formatTime(i.time)}`,
    `Patient ${i.patientLabel || '-'} ${n(i.ageYears, 'y')}`,
    `BP ${n(v.sbp)}/${n(v.dbp)} P ${n(v.hr)} RR ${n(v.rr)} T ${n(v.tempC)} SpO2 ${n(v.spo2)} GCS ${n(v.gcs)}`,
    q,
    c,
    i.context.obstetric ? 'Obstetric' : '',
    i.recommendation.findings.length ? `Attention: ${i.recommendation.findings.join(', ')}` : '',
    'Please evaluate per protocol. (Prototype, not a medical device)',
  ].filter(Boolean);
  return parts.join('. ');
}
