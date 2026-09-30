import { useCallback, useState } from 'react';
import { analyzeCapture } from '../../engine/analyze';
import { fromCsv, toCsv } from '../../engine/csv';
import { withParams } from '../../engine/params';
import { SIGNALS } from '../../engine/signals';
import type { CaptureInput, CrtResult, Protocol, SignalKind } from '../../engine/types';
import { db } from '../../storage/db';
import { Chrome } from '../components/Cards';
import { RecoveryChart, FullRecordingChart, fmtS, QualityTable } from '../components/Explain';
import { ScanView, type Captured } from '../components/ScanView';

interface Trial {
  name: string;
  capture: CaptureInput;
  meta: Record<string, unknown>;
  results: Record<SignalKind, CrtResult>;
}

const KINDS = Object.keys(SIGNALS) as SignalKind[];
const newSessionId = () => `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function analyzeAll(capture: CaptureInput): Record<SignalKind, CrtResult> {
  return Object.fromEntries(KINDS.map((k) => [k, analyzeCapture(capture, withParams({ signalKind: k }))])) as Record<SignalKind, CrtResult>;
}

function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Experiment page (Phase 1): compare protocols A/B/C × candidate signals, export CSV. */
export function Experiment() {
  const [subject, setSubject] = useState('S01');
  const [protocol, setProtocol] = useState<Protocol>('A');
  const [follow, setFollow] = useState(false);
  const [lock, setLock] = useState(true);
  const [saveCrops, setSaveCrops] = useState(false);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const [sessionId, setSessionId] = useState(newSessionId);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);

  const onCrop = useCallback((idx: number, t: number, png: Blob) => {
    // Capture the session ID in this callback so delayed blob conversions cannot enter the next trial.
    void db.debugCrops.add({ sessionId, idx, t, png }).catch(() => setError('Some annotation frames could not be saved. Check the storage space before continuing.'));
  }, [sessionId]);

  const onCaptured = (c: Captured) => {
    const n = trials.filter((t) => t.meta.subject === subject && t.meta.protocol === protocol).length + 1;
    const name = `${subject}_${protocol}_${n}`;
    const meta = { subject, protocol, trial: n, sessionId: saveCrops ? sessionId : null, device: c.device, recordedAt: new Date().toISOString() };
    setTrials([{ name, capture: c.capture, meta, results: analyzeAll(c.capture) }, ...trials]);
    setOpen(0);
    setSessionId(newSessionId());
    setScanKey((k) => k + 1);
  };

  const importCsv = async (files: FileList | null) => {
    if (!files) return;
    const added: Trial[] = [];
    for (const f of Array.from(files)) {
      try {
        const { input, meta } = fromCsv(await f.text());
        added.push({ name: f.name.replace(/\.csv$/, ''), capture: input, meta, results: analyzeAll(input) });
      } catch (e) {
        alert(`${f.name}: ${(e as Error).message}`);
      }
    }
    setTrials((current) => [...added, ...current]);
  };

  return (
    <Chrome back="/">
      <h1>Experiment (Phase 1)</h1>
      {error && <div className="card bad" role="alert">{error}</div>}
      <p className="muted">
        Compare protocols and signals on healthy, consenting subjects. Data stays on the device; the CSV export contains derived signals, not video. Download the trials before leaving the page.
      </p>
      <fieldset className="card stack experiment-settings" disabled={recording} aria-label="Trial settings">
        <div className="grid2">
          <label className="field">
            Subject code <span className="hint">No name. E.g. S01</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value.replace(/[^\w-]/g, ''))} />
          </label>
          <label className="field">
            Protocol
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as Protocol)}>
              <option value="A">A — clear glass/plastic</option>
              <option value="B">B — non-contact</option>
              <option value="C">C — lens contact + torch</option>
            </select>
          </label>
        </div>
        <label className="check"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Lock exposure & white balance (if supported)</label>
        <label className="check"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> ROI follows motion (tracking)</label>
        <label className="check"><input type="checkbox" checked={saveCrops} onChange={(e) => setSaveCrops(e.target.checked)} /> Save per-frame ROI crops for annotation (requires the subject's consent)</label>
      </fieldset>

      <ScanView key={`${scanKey}-${follow}-${saveCrops}`} protocol={protocol} onProtocol={setProtocol} experiment follow={follow} lockAeAwb={lock} onCrop={saveCrops ? onCrop : undefined} onCaptured={onCaptured} onRunningChange={setRecording} />

      <section className="card">
        <div className="row">
          <h2 className="grow">Trials ({trials.length})</h2>
          <label className="btn small">
            Import CSV
            <input type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => void importCsv(e.target.files)} />
          </label>
          {trials.length > 0 && (
            <button className="btn small" onClick={() => trials.forEach((t, i) => setTimeout(() => download(`${t.name}.csv`, toCsv(t.capture, t.meta)), i * 400))}>
              Download all CSVs
            </button>
          )}
        </div>
        {!trials.length && <div className="empty-state"><h3>No trials yet</h3><p>Record a measurement with the camera or import a CAPIRA CSV to compare signals.<br />Download the trial results before leaving this page.</p></div>}
        {trials.map((t, i) => (
          <div key={t.name + i} className="card">
            <div className="row">
              <b className="grow">{t.name}</b>
              <button className="btn small" onClick={() => download(`${t.name}.csv`, toCsv(t.capture, t.meta))}>CSV</button>
              <button className="btn small" onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Close' : 'Details'}</button>
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr><th>Signal</th><th>Status</th><th>CNR</th><th>CRT</th><th>t50</th></tr>
                </thead>
                <tbody>
                  {KINDS.map((k) => {
                    const r = t.results[k];
                    const cnr = r.checks.find((c) => c.code === 'LOW_CONTRAST')?.value;
                    return (
                      <tr key={k}>
                        <td>{SIGNALS[k].label}</td>
                        <td>{r.status === 'ok' ? <span className="pill ok">ok</span> : r.status === 'censored' ? <span className="pill attn">censored</span> : <span className="pill bad">rejected</span>}</td>
                        <td>{cnr == null ? '—' : cnr.toFixed(1)}</td>
                        <td>{fmtS(r.crt)}</td>
                        <td>{fmtS(r.t50)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {open === i && (
              <div className="stack">
                <RecoveryChart crt={t.results.rg} />
                <FullRecordingChart crt={t.results.rg} />
                <QualityTable checks={t.results.rg.checks} />
                <details>
                  <summary>Metadata</summary>
                  <pre className="kbd">{JSON.stringify(t.meta, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        ))}
      </section>
    </Chrome>
  );
}
