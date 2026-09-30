import { buildRecord, type PatientForm } from '../clinical/assess';
import { analyzeCapture } from '../engine/analyze';
import type { CaptureInput } from '../engine/types';
import { db, saveAssessment } from '../storage/db';
import { go } from './router';

/** Analyze (if there is a recording) → assemble the record → save locally → open the result. */
export async function finishAssessment(args: {
  form: PatientForm;
  capture: CaptureInput | null;
  simulated: boolean;
  device?: Record<string, unknown> | null;
  snapshot?: string | null;
}): Promise<number> {
  const crt = args.capture ? analyzeCapture(args.capture) : null;
  const rec = buildRecord({ form: args.form, capture: args.capture, crt, simulated: args.simulated, device: args.device ?? null });
  rec.snapshot = args.snapshot ?? null;
  const id = await saveAssessment(rec);
  go(`/result/${id}`);
  return id;
}

export async function updateAssessment(id: number, patch: Parameters<typeof db.assessments.update>[1]) {
  await db.assessments.update(id, patch);
}
