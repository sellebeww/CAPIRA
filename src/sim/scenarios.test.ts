import { describe, expect, it } from 'vitest';
import { buildRecord } from '../clinical/assess';
import { analyzeCapture } from '../engine/analyze';
import { SCENARIOS, scenarioCapture } from './scenarios';

const expected: Record<string, { crt: string; qsofa: string }> = {
  'adult-prolonged': { crt: 'prolonged', qsofa: 'complete' },
  'adult-normal': { crt: 'within_limit', qsofa: 'complete' },
  'low-quality': { crt: 'low_quality', qsofa: 'complete' },
  child: { crt: 'prolonged', qsofa: 'not_applicable' },
  'obstetric-incomplete': { crt: 'within_limit', qsofa: 'incomplete' },
};

describe('Simulation Mode scenarios', () => {
  for (const s of SCENARIOS) {
    it(`${s.id} produces the intended category and is labelled as a simulation`, () => {
      const capture = scenarioCapture(s);
      const crt = analyzeCapture(capture);
      const rec = buildRecord({ form: s.form, capture, crt, simulated: true });
      expect(rec.crtInterp.status).toBe(expected[s.id].crt);
      expect(rec.qsofa.status).toBe(expected[s.id].qsofa);
      expect(rec.simulated).toBe(true);
      expect(rec.referralText).toMatch(/SIMULATION/);
    });
  }
});
