import { useEffect, useRef, useState } from 'react';
import { referralTexts } from '../../clinical/assess';
import type { CrtInterpretation } from '../../clinical/crt';
import { QSOFA_PERMANENT_NOTE, QSOFA_SCOPE_NOTE, type QsofaResult } from '../../clinical/qsofa';
import { MOCK_FACILITIES } from '../../referral/facilities';
import { getSetting, setSetting, type AssessmentRecord } from '../../storage/db';
import { Cue } from '../../capture/protocol';
export { Chrome } from './Shell';

export function Steps({ at }: { at: 1 | 2 | 3 }) {
  return (
    <div className="steps" aria-label={`Step ${at} of 3`}>
      {['Data & vital signs', 'Scan CRT', 'Assessment result'].map((label, i) => (
        <div key={label} className={`step ${i + 1 <= at ? 'on' : ''}`} aria-current={i + 1 === at ? 'step' : undefined}><span>{i + 1 < at ? '✓' : i + 1}</span><b>{label}</b></div>
      ))}
    </div>
  );
}

export function CrtCard({ interp, manualCrtS }: { interp: CrtInterpretation; manualCrtS?: number | null }) {
  const tone = interp.status === 'low_quality' ? 'bad' : interp.status === 'prolonged' ? 'attn' : interp.status === 'within_limit' ? 'ok' : 'info';
  return (
    <section className={`card ${tone}`} aria-live="polite">
      <div className="row">
        <h2 className="grow">Capillary Refill Time</h2>
        <span className="pill muted">separate supporting finding</span>
      </div>
      {interp.displayValueS !== null && <div className="big">{interp.displayValueS.toFixed(1)} s</div>}
      <p className="headline">{interp.headline}</p>
      {interp.thresholdS !== null && (
        <p className="muted">
          Threshold ({interp.ageGroup}): &gt; {interp.thresholdS} s is considered prolonged.
        </p>
      )}
      {manualCrtS != null && (
        <p>
          Manual CRT (subjective, nurse's count): <b>{manualCrtS.toFixed(1)} s</b>
        </p>
      )}
      {interp.warnings.map((w) => (
        <p key={w}>⚠ {w}</p>
      ))}
    </section>
  );
}

export function QsofaCard({ q }: { q: QsofaResult }) {
  const tone = q.status === 'not_applicable' ? 'info' : q.elevated ? 'attn' : q.status === 'complete' ? '' : 'info';
  return (
    <section className={`card ${tone}`}>
      <h2>qSOFA</h2>
      <p className="headline">{q.headline}</p>
      {q.status !== 'not_applicable' && (
        <ul className="crit">
          {q.criteria.map((c) => (
            <li key={c.key}>
              <span>
                {c.label} <span className="muted">{c.rule}</span>
                {c.error && <span style={{ color: 'var(--bad)' }}> — {c.error}</span>}
              </span>
              <span>
                {c.value ?? '—'}{' '}
                {c.met === null ? <span className="pill muted">not assessed</span> : c.met ? <span className="pill attn">yes</span> : <span className="pill ok">no</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {q.status !== 'not_applicable' && <p><b>{QSOFA_PERMANENT_NOTE}</b></p>}
      {q.warnings.map((w) => (
        <p key={w}>⚠ {w}</p>
      ))}
      <p className="muted" style={{ fontSize: '0.85rem' }}>{QSOFA_SCOPE_NOTE}</p>
    </section>
  );
}

/** Network-free export: copy, sms:, Web Share (OS share sheet), download .txt (K9g). */
export function ReferralPanel({ rec }: { rec: AssessmentRecord }) {
  const [facilityId, setFacilityId] = useState(MOCK_FACILITIES[0].id);
  const [sender, setSender] = useState('');
  const [senderFac, setSenderFac] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void getSetting('senderName', '').then(setSender).catch(() => setMsg('Sender preference could not be loaded. Re-enter it if needed.'));
    void getSetting('senderFacility', '').then(setSenderFac).catch(() => setMsg('Facility preference could not be loaded. Re-enter it if needed.'));
  }, []);
  const facility = MOCK_FACILITIES.find((f) => f.id === facilityId) ?? null;
  const { full, sms } = referralTexts(rec, facility, sender, senderFac);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      flash('Copied.');
    } catch {
      flash('Copy failed — select the text manually.');
    }
  };
  const share = async () => {
    if (!navigator.share) return flash('This browser does not support the share sheet.');
    try {
      await navigator.share({ title: 'CAPIRA referral draft', text: full });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) flash('Sharing did not succeed. Use Copy or Download .txt.');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([full], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `capira-referral-${rec.createdAt}.txt` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="card">
      <h2>Referral draft</h2>
      <p className="muted">Automatic template from the data above (offline, no AI). Review & complete before sending.</p>
      <div className="stack">
        <label className="field">
          Referral destination <span className="hint">Facility data = MOCK (fictional examples)</span>
          <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            {MOCK_FACILITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <label className="field">
            Sender name
            <input value={sender} onChange={(e) => { setSender(e.target.value); void setSetting('senderName', e.target.value).catch(() => flash('Sender name was not saved.')); }} />
          </label>
          <label className="field">
            Sender facility
            <input value={senderFac} onChange={(e) => { setSenderFac(e.target.value); void setSetting('senderFacility', e.target.value).catch(() => flash('Sender facility was not saved.')); }} />
          </label>
        </div>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary>Show full text</summary>
        <pre className="kbd card">{full}</pre>
      </details>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={copy}>Copy</button>
        <a className="btn" href={`sms:?body=${encodeURIComponent(sms)}`}>SMS</a>
        <button className="btn" onClick={share}>Share…</button>
        <button className="btn" onClick={download}>Download .txt</button>
      </div>
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}

/**
 * Fallback for low quality (8A): a standardized seconds-counting timer.
 * The result is SUBJECTIVE and stored separately from the measured CRT.
 */
export function ManualCrtTimer({ onResult }: { onResult: (s: number) => void }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(0);
  const cue = useRef(new Cue());
  const tick = useRef<number | undefined>(undefined);
  const last = useRef(0);
  const begin = () => {
    cue.current.unlock();
    start.current = performance.now();
    last.current = 0;
    setRunning(true);
    cue.current.release();
    tick.current = window.setInterval(() => {
      const e = (performance.now() - start.current) / 1000;
      setElapsed(e);
      if (Math.floor(e) > last.current) {
        last.current = Math.floor(e);
        cue.current.beep(1000, 0.08);
      }
    }, 50);
  };
  const stop = () => {
    clearInterval(tick.current);
    setRunning(false);
    onResult((performance.now() - start.current) / 1000);
  };
  useEffect(() => () => clearInterval(tick.current), []);
  return (
    <div className="card info">
      <h3>Manual CRT (subjective)</h3>
      <p className="muted">
        Press the patient's finger until pale. Tap <b>Release</b> exactly when you release; it beeps every second. Tap <b>Color returned</b> when the color recovers.
        This result is subjective and labelled separately from the camera measurement.
      </p>
      <div className="big">{elapsed.toFixed(1)} s</div>
      <div className="row">
        {!running ? (
          <button className="btn primary grow" onClick={begin}>Release (start counting)</button>
        ) : (
          <button className="btn primary grow" onClick={stop}>Color returned</button>
        )}
      </div>
    </div>
  );
}
