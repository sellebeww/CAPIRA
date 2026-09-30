import { describe, expect, it } from 'vitest';
import { analyzeCapture } from './analyze';
import { fromCsv, toCsv } from './csv';
import { synthesize } from './synthetic';

describe('Recording CSV', () => {
  it('round-trip preserves the analysis result', () => {
    const { input } = synthesize({ seed: 3, crtS: 2.5, skin: 'light', noiseSD: 0.0008 });
    const csv = toCsv(input, { subject: 'S01' });
    const { input: back, meta } = fromCsv(csv);
    expect(meta.subject).toBe('S01');
    expect(back.frames.length).toBe(input.frames.length);
    const a = analyzeCapture(input);
    const b = analyzeCapture(back);
    expect(b.status).toBe(a.status);
    expect(b.crt!).toBeCloseTo(a.crt!, 3);
  });
  it('rejects a file without meta', () => {
    expect(() => fromCsv('t,roi_r\n1,2')).toThrow(/capira-v1/);
  });
  const meta = '# capira-v1 {"protocol":"A","pressCue":2,"releaseCue":12}\n';
  it('rejects a missing header with a clear message', () => {
    expect(() => fromCsv(meta)).toThrow(/header/);
  });
  it('rejects missing required columns and an empty recording', () => {
    expect(() => fromCsv(meta + 't,roi_r\n1,2')).toThrow(/columns/);
    expect(() => fromCsv(meta + 't,roi_r,roi_g,roi_b\n')).toThrow(/frame/);
  });
  it('rejects non-numeric values, empty values, and a partial reference', () => {
    expect(() => fromCsv(meta + 't,roi_r,roi_g,roi_b\n1,no,2,3')).toThrow(/Invalid CSV value/);
    expect(() => fromCsv(meta + 't,roi_r,roi_g,roi_b\n1,,2,3')).toThrow(/empty/);
    expect(() => fromCsv(meta + 't,roi_r,roi_g,roi_b,ref_r\n1,1,2,3,2')).toThrow(/reference/);
  });
  it('rejects a release marker that precedes the press', () => {
    expect(() => fromCsv(meta.replace('"releaseCue":12', '"releaseCue":1') + 't,roi_r,roi_g,roi_b\n1,1,2,3')).toThrow(/metadata/);
  });
});
