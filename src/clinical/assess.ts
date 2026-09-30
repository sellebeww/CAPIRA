import type { CaptureInput, CrtResult } from '../engine/types';
import type { Facility } from '../referral/facilities';
import { buildReferralText, buildSmsText, type ReferralInput, type ReferralVitals } from '../referral/template';
import type { AssessmentRecord } from '../storage/db';
import { interpretCrt } from './crt';
import { computeQsofa } from './qsofa';
import { buildRecommendation } from './recommendation';

/** Data entered by the nurse in step 1. */
export interface PatientForm {
  patientLabel: string;
  ageYears: number | null;
  sex: 'M' | 'F' | null;
  complaint: string;
  vitals: ReferralVitals;
  context: { cold: boolean; handAtHeartLevel: boolean; obstetric: boolean };
}

export const EMPTY_FORM: PatientForm = {
  patientLabel: '',
  ageYears: null,
  sex: null,
  complaint: '',
  vitals: {},
  context: { cold: false, handAtHeartLevel: true, obstetric: false },
};

export function assessmentFrom(form: PatientForm) {
  const qsofa = computeQsofa({ rr: form.vitals.rr, sbp: form.vitals.sbp, gcs: form.vitals.gcs, ageYears: form.ageYears, obstetric: form.context.obstetric });
  return { qsofa };
}

/** Assemble the full record from the form + scan result. Every part is deterministic. */
export function buildRecord(args: {
  form: PatientForm;
  capture: CaptureInput | null;
  crt: CrtResult | null;
  manualCrtS?: number | null;
  simulated: boolean;
  device?: Record<string, unknown> | null;
  facility?: Facility | null;
  senderName?: string;
  senderFacility?: string;
  createdAt?: number;
  latencyMs?: number | null;
}): AssessmentRecord {
  const { form } = args;
  const { qsofa } = assessmentFrom(form);
  const crtInterp = interpretCrt(args.crt, { ageYears: form.ageYears, cold: form.context.cold, handAtHeartLevel: form.context.handAtHeartLevel });
  const createdAt = args.createdAt ?? Date.now();
  const rec: AssessmentRecord = {
    createdAt,
    simulated: args.simulated,
    patientLabel: form.patientLabel,
    ageYears: form.ageYears,
    sex: form.sex,
    complaint: form.complaint,
    vitals: form.vitals,
    context: form.context,
    qsofa,
    capture: args.capture,
    crt: args.crt,
    crtInterp,
    manualCrtS: args.manualCrtS ?? null,
    latencyMs: args.latencyMs ?? null,
    device: args.device ?? null,
    referralText: '',
  };
  rec.referralText = buildReferralText(referralInputFrom(rec, args.facility, args.senderName, args.senderFacility));
  return rec;
}

export function referralInputFrom(rec: AssessmentRecord, facility?: Facility | null, senderName?: string, senderFacility?: string): ReferralInput {
  const crtInterp = rec.crtInterp;
  return {
    patientLabel: rec.patientLabel,
    ageYears: rec.ageYears,
    sex: rec.sex,
    complaint: rec.complaint,
    vitals: rec.vitals,
    context: rec.context,
    qsofa: rec.qsofa,
    crt: rec.crt,
    crtInterp,
    manualCrtS: rec.manualCrtS,
    recommendation: buildRecommendation(rec.qsofa, crtInterp),
    facility,
    senderName,
    senderFacility,
    time: new Date(rec.createdAt),
    simulated: rec.simulated,
  };
}

export function referralTexts(rec: AssessmentRecord, facility?: Facility | null, senderName?: string, senderFacility?: string) {
  const input = referralInputFrom(rec, facility, senderName, senderFacility);
  return { full: buildReferralText(input), sms: buildSmsText(input) };
}
