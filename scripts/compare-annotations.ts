/**
 * Compare the engine CRT with BLINDED frame-by-frame annotation (K7 ground truth #2).
 *
 *   npm run compare -- annotations.csv data/raw/*.csv
 *
 * Recording CSVs must come from the Experiment page with "Save ROI crops" enabled (meta.sessionId filled in).
 * Ground truth per session = mean of the annotators (≥2 required). Reported: MAE, bias, Bland-Altman limits of agreement,
 * inter-annotator spread, and rejection rate. Healthy subjects do NOT prove detection of critical conditions.
 */
import { readFileSync } from 'node:fs';
import { analyzeCapture } from '../src/engine/analyze';
import { fromCsv } from '../src/engine/csv';
import { parseCsvRows } from '../src/engine/csv-fields';

const [annotFile, ...captureFiles] = process.argv.slice(2);
if (!annotFile || !captureFiles.length) {
  console.error('Usage: npm run compare -- <annotations.csv> <recording.csv> [...]');
  process.exit(1);
}

const ann = new Map<string, number[]>();
for (const [sessionId, , , , crt] of parseCsvRows(readFileSync(annotFile, 'utf8')).slice(1)) {
  if (!crt || !Number.isFinite(Number(crt)) || Number(crt) < 0) continue;
  ann.set(sessionId, [...(ann.get(sessionId) ?? []), Number(crt)]);
}

const rows: { session: string; engine: number | null; status: string; truth: number; spread: number; n: number }[] = [];
for (const f of captureFiles) {
  const { input, meta } = fromCsv(readFileSync(f, 'utf8'));
  const sid = String(meta.sessionId ?? '');
  const a = ann.get(sid);
  if (!a || a.length < 2) {
    console.error(`Skipping ${f}: <2 annotations for session "${sid}".`);
    continue;
  }
  const res = analyzeCapture(input);
  rows.push({
    session: sid,
    engine: res.crt,
    status: res.status,
    truth: a.reduce((s, v) => s + v, 0) / a.length,
    spread: Math.max(...a) - Math.min(...a),
    n: a.length,
  });
}

const ok = rows.filter((r) => r.engine !== null);
const d = ok.map((r) => r.engine! - r.truth);
const bias = d.reduce((s, v) => s + v, 0) / (d.length || 1);
const sd = Math.sqrt(d.reduce((s, v) => s + (v - bias) ** 2, 0) / Math.max(1, d.length - 1));
const mae = d.reduce((s, v) => s + Math.abs(v), 0) / (d.length || 1);
const f = (v: number) => v.toFixed(2);

console.log('| Session | Engine status | Engine CRT | Annotator CRT (mean) | Inter-annotator range | n annotators |\n|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.session} | ${r.status} | ${r.engine === null ? '—' : f(r.engine)} | ${f(r.truth)} | ${f(r.spread)} | ${r.n} |`);
console.log(`\nSessions: ${rows.length}; rejected/censored: ${rows.length - ok.length} (${((1 - ok.length / (rows.length || 1)) * 100).toFixed(0)}%).`);
if (ok.length) console.log(`MAE ${f(mae)} s; bias ${f(bias)} s; 95% limits of agreement [${f(bias - 1.96 * sd)}, ${f(bias + 1.96 * sd)}] s (n=${ok.length}).`);
