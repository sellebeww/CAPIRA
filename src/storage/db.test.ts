import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { interpretCrt } from '../clinical/crt';
import { computeQsofa } from '../clinical/qsofa';
import {
  CapiraDB,
  deleteAllData,
  deleteAssessment,
  getAssessment,
  getSetting,
  listAssessments,
  saveAssessment,
  setSetting,
  type AssessmentRecord,
} from './db';

function rec(createdAt: number): AssessmentRecord {
  return {
    createdAt,
    simulated: false,
    patientLabel: 'X',
    ageYears: 40,
    sex: null,
    complaint: '',
    vitals: { rr: 16 },
    context: { cold: false, handAtHeartLevel: true, obstetric: false },
    qsofa: computeQsofa({ rr: 16, ageYears: 40 }),
    capture: null,
    crt: null,
    crtInterp: interpretCrt(null, { ageYears: 40 }),
    manualCrtS: null,
    latencyMs: null,
    device: null,
    referralText: '',
  };
}

describe('local storage', () => {
  it('save, newest-first order, delete per item, delete all', async () => {
    const d = new CapiraDB('test-' + Math.random());
    const a = await saveAssessment(rec(1), d);
    await saveAssessment(rec(2), d);
    const list = await listAssessments(d);
    expect(list.map((r) => r.createdAt)).toEqual([2, 1]);
    await deleteAssessment(a, d);
    expect(await getAssessment(a, d)).toBeUndefined();
    await setSetting('protocol', 'A', d);
    expect(await getSetting('protocol', 'B', d)).toBe('A');
    await deleteAllData(d);
    expect(await listAssessments(d)).toEqual([]);
    expect(await getSetting('protocol', 'B', d)).toBe('B');
  });
  it('a record has no video field', () => {
    expect(Object.keys(rec(1))).not.toContain('video');
  });
});
