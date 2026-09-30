import { describe, expect, it } from 'vitest';
import { csvRow, parseCsvRows } from './csv-fields';

describe('Annotation CSV', () => {
  it('preserves an annotator code with commas, quotes, and newlines', () => {
    const cells = ['S01', 'Nurse, "A"\nTeam 1', '2.5', '4.5', '2'];
    expect(parseCsvRows(csvRow(cells) + '\r\n')).toEqual([cells]);
  });
  it('reads an old export without quotes and with empty columns', () => {
    expect(parseCsvRows('s,a,r,p,c\r\nS01,A,2,,\r\n\r\n')).toEqual([['s', 'a', 'r', 'p', 'c'], ['S01', 'A', '2', '', '']]);
  });
  it('rejects an unclosed quotation mark', () => {
    expect(() => parseCsvRows('S01,"A')).toThrow(/quotation/);
  });
});
