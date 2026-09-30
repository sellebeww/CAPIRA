import Dexie, { type EntityTable } from 'dexie';
import type { CrtInterpretation } from '../clinical/crt';
import type { QsofaResult } from '../clinical/qsofa';
import type { CaptureInput, CrtResult } from '../engine/types';
import type { ReferralVitals } from '../referral/template';

/**
 * Local storage (IndexedDB). Derived signals + metadata only — NO video.
 * Never sent over the network.
 */
export interface AssessmentRecord {
  id?: number;
  createdAt: number;
  simulated: boolean;
  patientLabel: string;
  ageYears: number | null;
  sex: 'M' | 'F' | null;
  complaint: string;
  vitals: ReferralVitals;
  context: { cold: boolean; handAtHeartLevel: boolean; obstetric: boolean };
  qsofa: QsofaResult;
  /** Derived per-frame signal (mean ROI/reference color) + markers, for re-analysis. */
  capture: CaptureInput | null;
  crt: CrtResult | null;
  crtInterp: CrtInterpretation;
  manualCrtS: number | null;
  /** Time from the end of capture until the result is shown (ms), measured on the device. */
  latencyMs: number | null;
  device: Record<string, unknown> | null;
  /** Small thumbnail (JPEG 320px) of the finger area with the ROI box — for transparency; not video. */
  snapshot?: string | null;
  referralText: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

/** Per-frame ROI crops for ground-truth annotation — ONLY when the debug toggle is on. */
export interface DebugCropRecord {
  id?: number;
  sessionId: string;
  idx: number;
  t: number;
  png: Blob;
}

export class CapiraDB extends Dexie {
  assessments!: EntityTable<AssessmentRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  debugCrops!: EntityTable<DebugCropRecord, 'id'>;

  constructor(name = 'capira') {
    super(name);
    this.version(1).stores({
      assessments: '++id, createdAt, simulated',
      settings: 'key',
      debugCrops: '++id, sessionId, [sessionId+idx]',
    });
  }
}

export const db = new CapiraDB();

export async function saveAssessment(rec: AssessmentRecord, d: CapiraDB = db): Promise<number> {
  return (await d.assessments.add(rec)) as number;
}

export function listAssessments(d: CapiraDB = db): Promise<AssessmentRecord[]> {
  return d.assessments.orderBy('createdAt').reverse().toArray();
}

export function getAssessment(id: number, d: CapiraDB = db): Promise<AssessmentRecord | undefined> {
  return d.assessments.get(id);
}

export function deleteAssessment(id: number, d: CapiraDB = db): Promise<void> {
  return d.assessments.delete(id);
}

/** Delete ALL local data (history, debug crops, settings). */
export async function deleteAllData(d: CapiraDB = db): Promise<void> {
  await d.transaction('rw', d.assessments, d.settings, d.debugCrops, async () => {
    await d.assessments.clear();
    await d.settings.clear();
    await d.debugCrops.clear();
  });
}

export async function getSetting<T>(key: string, fallback: T, d: CapiraDB = db): Promise<T> {
  const r = await d.settings.get(key);
  return r ? (r.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown, d: CapiraDB = db): Promise<void> {
  await d.settings.put({ key, value });
}
