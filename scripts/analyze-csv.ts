/**
 * Batch analysis of CSVs from the Experiment page (Phase 1, go/no-go).
 *
 *   npm run analyze -- data/raw/*.csv
 *
 * For each file: run the engine with every candidate signal (with/without reference),
 * then summarize per protocol × signal: median CNR, rejection rate, and between-repetition CRT SD per subject.
 * Pass criteria: docs/PROTOCOL.md.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyzeCapture } from '../src/engine/analyze';
import { fromCsv } from '../src/engine/csv';
import { median, std } from '../src/engine/filters';
import { withParams } from '../src/engine/params';
import type { SignalKind } from '../src/engine/types';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('Usage: npm run analyze -- <file.csv> [...]');
  process.exit(1);
}

const kinds: SignalKind[] = ['rg', 'astar', 'hue', 'sat', 'gInv'];
interface Row {
  file: string;
  subject: string;
  protocol: string;
  kind: SignalKind;
  ref: boolean;
  status: string;
  cnr: number | null;
  crt: number | null;
  t50: number | null;
  reasons: string;
}
const rows: Row[] = [];

for (const f of files) {
  const { input, meta } = fromCsv(readFileSync(f, 'utf8'));
  const subject = String(meta.subject ?? basename(f).split('_')[0]);
  for (const kind of kinds)
    for (const ref of [true, false]) {
      const res = analyzeCapture(input, withParams({ signalKind: kind, useReference: ref }));
      rows.push({
        file: basename(f),
        subject,
        protocol: input.protocol,
        kind,
        ref,
        status: res.status,
        cnr: res.checks.find((c) => c.code === 'LOW_CONTRAST')?.value ?? null,
        crt: res.crt,
        t50: res.t50,
        reasons: res.checks.filter((c) => !c.pass).map((c) => c.code).join(' '),
      });
    }
}

const f2 = (v: number | null) => (v === null || Number.isNaN(v) ? '–' : v.toFixed(2));
console.log('## Per file\n');
console.log('| File | Subject | Prot. | Signal | Ref | Status | CNR | CRT | t50 | Failed |\n|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows)
  console.log(`| ${r.file} | ${r.subject} | ${r.protocol} | ${r.kind} | ${r.ref ? 'yes' : 'no'} | ${r.status} | ${f2(r.cnr)} | ${f2(r.crt)} | ${f2(r.t50)} | ${r.reasons} |`);

console.log('\n## Summary: protocol × signal\n');
console.log('| Prot. | Signal | Ref | n | Reject | Median CNR | Subjects CNR≥10 | SD CRT between repetitions (median per subject) |\n|---|---|---|---|---|---|---|---|');
const keys = [...new Set(rows.map((r) => `${r.protocol}|${r.kind}|${r.ref}`))];
for (const k of keys) {
  const rs = rows.filter((r) => `${r.protocol}|${r.kind}|${r.ref}` === k);
  const [protocol, kind, ref] = k.split('|');
  const cnrs = rs.map((r) => r.cnr).filter((v): v is number => v !== null);
  const subjects = [...new Set(rs.map((r) => r.subject))];
  const subjOk = subjects.filter((s) => median(rs.filter((r) => r.subject === s && r.cnr !== null).map((r) => r.cnr!)) >= 10).length;
  const sds = subjects
    .map((s) => rs.filter((r) => r.subject === s && r.crt !== null).map((r) => r.crt!))
    .filter((v) => v.length >= 2)
    .map((v) => std(v));
  console.log(
    `| ${protocol} | ${kind} | ${ref === 'true' ? 'yes' : 'no'} | ${rs.length} | ${((rs.filter((r) => r.status === 'rejected').length / rs.length) * 100).toFixed(0)}% | ${f2(median(cnrs))} | ${subjOk}/${subjects.length} | ${sds.length ? f2(median(sds)) : '–'} |`,
  );
}
