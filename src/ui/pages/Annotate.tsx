import { useEffect, useMemo, useState } from 'react';
import { db, getSetting, setSetting, type DebugCropRecord } from '../../storage/db';
import { Chrome } from '../components/Cards';
import { csvRow } from '../../engine/csv-fields';

interface Annotation {
  sessionId: string;
  annotator: string;
  releaseIdx: number | null;
  releaseT: number | null;
  recoveredIdx: number | null;
  recoveredT: number | null;
}

const key = (s: string, a: string) => `annot:${s}:${a}`;

/**
 * Frame-by-frame annotation BLINDED to the engine output (K7 ground truth #2).
 * This page deliberately does not show the app's CRT result.
 */
export function Annotate() {
  const [sessions, setSessions] = useState<string[]>([]);
  const [session, setSession] = useState('');
  const [annotator, setAnnotator] = useState('');
  const [crops, setCrops] = useState<DebugCropRecord[]>([]);
  const [i, setI] = useState(0);
  const [ann, setAnn] = useState<Annotation | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void db.debugCrops.orderBy('sessionId').uniqueKeys().then((k) => setSessions(k as string[])).catch(() => setError('Annotation sessions could not be loaded. Check the browser storage.'));
    void getSetting('annotator', '').then(setAnnotator).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setCrops([]); setI(0);
    if (!session) return;
    void db.debugCrops.where('sessionId').equals(session).sortBy('idx').then((c) => {
      if (!active) return;
      setCrops(c);
      setI(0);
    }).catch(() => { if (active) setError('The session frames could not be loaded.'); });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    const u = crops.map((c) => URL.createObjectURL(c.png));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [crops]);

  useEffect(() => {
    let active = true;
    setAnn(null);
    if (!session || !annotator) return setAnn(null);
    void getSetting<Annotation | null>(key(session, annotator), null).then((a) => {
      if (active) setAnn(a ?? { sessionId: session, annotator, releaseIdx: null, releaseT: null, recoveredIdx: null, recoveredT: null });
    }).catch(() => { if (active) setError('The annotation could not be loaded.'); });
    return () => { active = false; };
  }, [session, annotator]);

  const t0 = crops[0]?.t ?? 0;
  const cur = crops[i];
  const mark = async (which: 'release' | 'recovered') => {
    if (!ann || !cur || busy) return;
    const next = { ...ann, [`${which}Idx`]: cur.idx, [`${which}T`]: cur.t };
    if (next.releaseT !== null && next.recoveredT !== null && next.recoveredT <= next.releaseT) { setError('The color-returned frame must come after the released frame.'); return; }
    setBusy(true);
    try { await setSetting(key(session, annotator), next); setAnn(next); setError(''); }
    catch { setError('The annotation was not saved. Try marking again.'); }
    finally { setBusy(false); }
  };

  const exportAll = async () => {
    try {
    const all = await db.settings.filter((s) => s.key.startsWith('annot:')).toArray();
    const rows = ['sessionId,annotator,release_t,recovered_t,crt_annot_s'];
    for (const { value } of all) {
      const a = value as Annotation;
      const crt = a.releaseT !== null && a.recoveredT !== null ? (a.recoveredT - a.releaseT).toFixed(3) : '';
      rows.push(csvRow([a.sessionId, a.annotator, a.releaseT ?? '', a.recoveredT ?? '', crt]));
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n') + '\n'], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `capira-annotations-${Date.now()}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('The annotations could not be exported. Check the browser storage.'); }
  };

  const status = useMemo(() => {
    if (!ann) return '';
    const r = ann.releaseT !== null ? `released @ ${(ann.releaseT - t0).toFixed(2)} s` : 'released: not yet';
    const p = ann.recoveredT !== null ? `recovered @ ${(ann.recoveredT - t0).toFixed(2)} s` : 'recovered: not yet';
    return `${r} · ${p}`;
  }, [ann, t0]);

  return (
    <Chrome back="/">
      <h1>Blinded annotation</h1>
      {error && <div className="card bad" role="alert">{error}</div>}
      <p className="muted">
        Mark the frame when the pressure is <b>released</b> and when the color <b>returns to normal</b>. The app result is deliberately hidden. At least 2 independent annotators per session are needed.
      </p>
      <section className="card stack">
        <label className="field">
          Annotator name/code
          <input disabled={busy} value={annotator} onChange={(e) => { setAnnotator(e.target.value); void setSetting('annotator', e.target.value).catch(() => setError('The annotator code was not saved.')); }} />
        </label>
        <label className="field">
          Session
          <select disabled={busy} value={session} onChange={(e) => setSession(e.target.value)}>
            <option value="">— select —</option>
            {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {!sessions.length && <p className="muted">No sessions yet. Enable "Save ROI crops" on the Experiment page.</p>}
      </section>
      {cur && annotator && (
        <section className="card stack">
          <img src={urls[i]} alt={`frame ${i}`} style={{ width: '100%', imageRendering: 'pixelated', borderRadius: 8 }} />
          <div className="row"><b className="grow">Frame {i + 1}/{crops.length} · {(cur.t - t0).toFixed(3)} s</b></div>
          <input type="range" aria-label="Select annotation frame" min={0} max={crops.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} />
          <div className="row">
            <button className="btn grow" onClick={() => setI(Math.max(0, i - 10))}>−10</button>
            <button className="btn grow" onClick={() => setI(Math.max(0, i - 1))}>−1</button>
            <button className="btn grow" onClick={() => setI(Math.min(crops.length - 1, i + 1))}>+1</button>
            <button className="btn grow" onClick={() => setI(Math.min(crops.length - 1, i + 10))}>+10</button>
          </div>
          <div className="row">
            <button className="btn primary grow" disabled={busy || !ann} onClick={() => void mark('release')}>Mark: released</button>
            <button className="btn primary grow" disabled={busy || !ann} onClick={() => void mark('recovered')}>Mark: color returned</button>
          </div>
          <p>{status}</p>
        </section>
      )}
      <button className="btn block" onClick={() => void exportAll()}>Download all annotations (CSV)</button>
    </Chrome>
  );
}
