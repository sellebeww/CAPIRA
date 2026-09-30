/**
 * Measure engine accuracy on SYNTHETIC signals with a known CRT (K7 ground truth #1).
 * This proves the engine's *calculation* accuracy, NOT clinical accuracy on patients.
 *
 *   npm run accuracy                 # default configuration
 *   npm run accuracy -- --fit=median # compare fit sources
 *   npm run accuracy -- --seeds=20
 */
import { analyzeCapture } from '../src/engine/analyze';
import { withParams } from '../src/engine/params';
import { synthesize, type SynthOptions } from '../src/engine/synthetic';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const seeds = Number(args.seeds ?? 10);
const params = withParams({
  ...(args.fit ? { fitSource: args.fit as 'median' | 'sg' } : {}),
  ...(args.fitWin ? { fitSgWindowS: Number(args.fitWin) } : {}),
  ...(args.onset ? { onsetModel: args.onset as 'linear' | 'quadratic' } : {}),
  ...(args.x ? { recoveryX: Number(args.x) } : {}),
  ...(args.minCNR ? { gates: { minCNR: Number(args.minCNR) } } : {}),
});

interface Row {
  group: Record<string, string>;
  status: string;
  err: number | null;
  errT50: number | null;
  cnr: number | null;
  ms: number;
}

const crts = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6];
const skins: SynthOptions['skin'][] = ['light', 'medium', 'dark'];
const shapes: SynthOptions['shape'][] = ['exp', 'sigmoid'];
const relative = args.noiseModel === 'relative';
const noises = relative ? [0.005, 0.01, 0.02] : [0.001, 0.003, 0.006];

const rows: Row[] = [];
for (const crtS of crts)
  for (const skin of skins)
    for (const shape of shapes)
      for (const noiseSD of noises)
        for (let seed = 1; seed <= seeds; seed++) {
          const { input, truth } = synthesize({ seed: seed * 7919 + crtS * 13, crtS, skin, shape, noiseSD, noiseModel: relative ? 'relative' : 'additive', jitterMs: 3, dropProb: 0.01 });
          const t0 = performance.now();
          const res = analyzeCapture(input, params);
          const ms = performance.now() - t0;
          const tr = truth.crtAt(params.recoveryX, params.signalKind);
          const tr50 = truth.crtAt(0.5, params.signalKind);
          const cnrCheck = res.checks.find((c) => c.code === 'LOW_CONTRAST');
          rows.push({
            group: { crt: crtS < 3 ? '<3 s' : '≥3 s', skin: skin!, shape: shape!, noise: String(noiseSD) },
            status: res.status,
            err: res.status === 'ok' && tr !== null && res.crt !== null ? res.crt - tr : null,
            errT50: res.status === 'ok' && tr50 !== null && res.t50 !== null ? res.t50 - tr50 : null,
            cnr: cnrCheck?.value ?? null,
            ms,
          });
        }

function pct(v: number[], p: number) {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN;
}

function summarize(label: string, rs: Row[]) {
  const errs = rs.map((r) => r.err).filter((e): e is number => e !== null);
  const e50 = rs.map((r) => r.errT50).filter((e): e is number => e !== null);
  const n = rs.length;
  const rej = rs.filter((r) => r.status === 'rejected').length;
  const cen = rs.filter((r) => r.status === 'censored').length;
  const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length;
  const bias = errs.reduce((s, e) => s + e, 0) / errs.length;
  const sd = Math.sqrt(errs.reduce((s, e) => s + (e - bias) ** 2, 0) / Math.max(1, errs.length - 1));
  const mae50 = e50.reduce((s, e) => s + Math.abs(e), 0) / e50.length;
  const p95 = pct(errs.map(Math.abs), 0.95);
  return `| ${label} | ${n} | ${((rej / n) * 100).toFixed(1)}% | ${((cen / n) * 100).toFixed(1)}% | ${mae.toFixed(3)} | ${bias.toFixed(3)} | ${p95.toFixed(3)} | [${(bias - 1.96 * sd).toFixed(2)}, ${(bias + 1.96 * sd).toFixed(2)}] | ${mae50.toFixed(3)} |`;
}

const header =
  '| Group | n | Rejected | Censored | MAE CRT (s) | Bias (s) | P95 \\|err\\| (s) | Bland-Altman 95% limits of agreement | MAE t50 (s) |\n|---|---|---|---|---|---|---|---|---|';
const out: string[] = [];
out.push(`Noise model: ${relative ? 'relative (fraction of intensity)' : 'additive (absolute, linear)'}. Configuration: fitSource=${params.fitSource}, fitSgWindowS=${params.fitSgWindowS}, onset=${params.onsetModel}, X=${params.recoveryX}, signal=${params.signalKind}, minCNR=${params.gates.minCNR}, seeds=${seeds}`);
out.push('', header, summarize('All', rows));
for (const key of ['noise', 'skin', 'shape', 'crt'] as const) {
  const vals = [...new Set(rows.map((r) => r.group[key]))];
  for (const v of vals) out.push(summarize(`${key}=${v}`, rows.filter((r) => r.group[key] === v)));
}
out.push('', '**Per CNR bin (passing results only):**', '', '| CNR | n passing | MAE | P95 |err| |', '|---|---|---|---|');
const bins = [0, 6, 8, 10, 15, 25, 50, Infinity];
for (let i = 0; i < bins.length - 1; i++) {
  const rs = rows.filter((r) => r.err !== null && r.cnr !== null && r.cnr >= bins[i] && r.cnr < bins[i + 1]);
  if (!rs.length) continue;
  const errs = rs.map((r) => Math.abs(r.err!));
  out.push(`| ${bins[i]}–${bins[i + 1]} | ${rs.length} | ${(errs.reduce((s, e) => s + e, 0) / errs.length).toFixed(3)} | ${pct(errs, 0.95).toFixed(3)} |`);
}
const ms = rows.map((r) => r.ms);
out.push('', `Engine compute time per analysis (Node, dev machine — NOT a phone): median ${pct(ms, 0.5).toFixed(1)} ms, P95 ${pct(ms, 0.95).toFixed(1)} ms.`);
console.log(out.join('\n'));
