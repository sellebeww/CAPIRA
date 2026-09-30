import { useEffect, useState } from 'react';
import { buildRecommendation } from '../../clinical/recommendation';
import { deleteAssessment, getAssessment, type AssessmentRecord } from '../../storage/db';
import { Chrome, CrtCard, ManualCrtTimer, QsofaCard, ReferralPanel, Steps } from '../components/Cards';
import { ExplainPanel } from '../components/Explain';
import { useDraft } from '../draft';
import { updateAssessment } from '../finish';
import { go } from '../router';

export function Result({ id }: { id: number }) {
  const { captureEndedAt, setCaptureEndedAt, setForm } = useDraft();
  const [rec, setRec] = useState<AssessmentRecord | null | undefined>(undefined);
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Number.isSafeInteger(id) || id < 1) { setRec(null); return; }
    void getAssessment(id).then((r) => setRec(r ?? null)).catch(() => setError('The record could not be loaded. Check the browser storage permissions, then reload.'));
  }, [id]);

  // Result latency (measured): end of recording → result shown on screen.
  useEffect(() => {
    if (!rec || rec.latencyMs !== null || captureEndedAt === null || !rec.crt) return;
    const ended = captureEndedAt;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const latencyMs = performance.now() - ended;
        setCaptureEndedAt(null);
        void updateAssessment(id, { latencyMs }).catch(() => undefined);
        setRec((r) => (r ? { ...r, latencyMs } : r));
      }),
    );
  }, [rec, captureEndedAt, id, setCaptureEndedAt]);

  if (rec === undefined) return <Chrome back="/"><div className={`card ${error ? 'bad' : ''}`} role={error ? 'alert' : 'status'}>{error || 'Loading the assessment result…'}{error && <p><button className="btn" onClick={() => window.location.reload()}>Reload</button></p>}</div></Chrome>;
  if (rec === null) return <Chrome back="/"><div className="empty-state card"><h1>Record not found</h1><p>The address is invalid or the record has been deleted.</p><a className="btn" href="#/history">Open history</a></div></Chrome>;

  const reco = buildRecommendation(rec.qsofa, rec.crtInterp);
  const rejected = rec.crt?.status === 'rejected';
  const repeat = () => {
    setForm({
      patientLabel: rec.patientLabel,
      ageYears: rec.ageYears,
      sex: rec.sex,
      complaint: rec.complaint,
      vitals: rec.vitals,
      context: rec.context,
    });
    go(rec.simulated ? '/simulation' : '/scan');
  };
  const saveManual = async (s: number) => {
    try {
      await updateAssessment(id, { manualCrtS: s });
      setRec({ ...rec, manualCrtS: s });
      setShowManual(false); setError('');
    } catch { setError(`Manual CRT ${s.toFixed(1)} s was not saved. Check the browser storage.`); }
  };
  const remove = async () => {
    if (!confirm('Delete this record from the device?')) return;
    try { await deleteAssessment(id); go('/history'); }
    catch { setError('The record could not be deleted. Please try again.'); }
  };

  return (
    <Chrome simulated={rec.simulated} back="/">
      <Steps at={3} />
      <h1>Result & explanation</h1>
      {error && <div className="card bad" role="alert">{error}</div>}
      <p className="muted">
        {rec.patientLabel || 'No label'} · {rec.ageYears ?? '—'} y · {new Date(rec.createdAt).toLocaleString('en-US')}
      </p>

      {rec.crt ? <CrtCard interp={rec.crtInterp} manualCrtS={rec.manualCrtS} /> : (
        <section className="card info">
          <h2>Capillary Refill Time</h2>
          <p>Not measured with the camera in this assessment.</p>
          {rec.manualCrtS != null && <p>Manual CRT (subjective): <b>{rec.manualCrtS.toFixed(1)} s</b></p>}
        </section>
      )}

      {rejected && rec.crt && (
        <section className="card bad">
          <h3>Why it was rejected</h3>
          <ul>
            {rec.crt.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p>The app deliberately shows no number when data quality is low (better to refuse than to give a wrong number).</p>
          <div className="row">
            <button className="btn primary grow" onClick={repeat}>Repeat scan</button>
            <button className="btn grow" onClick={() => setShowManual(true)}>Measure manually (subjective)</button>
          </div>
        </section>
      )}
      {!rec.crt && !rec.simulated && (
        <button className="btn block" onClick={() => setShowManual(true)}>Add manual CRT (subjective)</button>
      )}
      {showManual && <ManualCrtTimer onResult={saveManual} />}

      <QsofaCard q={rec.qsofa} />

      <section className={`card ${reco.findings.length ? 'attn' : ''}`}>
        <h2>Summary</h2>
        <p>{reco.text}</p>
      </section>

      {rec.crt && (
        <details className="card" open={!rejected}>
          <summary>CRT result explanation (curve, ROI, quality, method)</summary>
          <ExplainPanel crt={rec.crt} snapshot={rec.snapshot} latencyMs={rec.latencyMs} device={rec.device} />
        </details>
      )}

      <ReferralPanel rec={rec} />

      <div className="row" style={{ marginBottom: 24 }}>
        <button className="btn grow" onClick={repeat}>{rec.simulated ? 'Another simulation' : 'Repeat scan'}</button>
        <button className="btn primary grow" onClick={() => go('/')}>Done</button>
      </div>
      <button className="btn danger small" onClick={remove}>Delete this record</button>
    </Chrome>
  );
}
