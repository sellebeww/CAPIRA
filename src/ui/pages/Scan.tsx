import { useEffect, useState } from 'react';
import type { Protocol } from '../../engine/types';
import { getSetting, setSetting } from '../../storage/db';
import { Chrome, Steps } from '../components/Cards';
import { ScanView, type Captured } from '../components/ScanView';
import { useDraft } from '../draft';
import { finishAssessment } from '../finish';

export function Scan() {
  const { form, setCaptureEndedAt } = useDraft();
  const [protocol, setProtocol] = useState<Protocol>('A');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Captured | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void getSetting<Protocol>('protocol', 'A').then((p) => setProtocol(['A', 'B', 'C'].includes(p) ? p : 'A')).catch(() => setError('Local settings could not be read. Protocol A is used.'));
  }, []);
  const onProtocol = (p: Protocol) => {
    setProtocol(p);
    void setSetting('protocol', p).catch(() => setError('The protocol preference was not saved. You can still continue.'));
  };
  const onCaptured = async (c: Captured) => {
    setBusy(true);
    setPending(c);
    setError('');
    setCaptureEndedAt(c.endedAt);
    try { await finishAssessment({ form, capture: c.capture, simulated: false, device: c.device, snapshot: c.snapshot }); }
    catch { setError('The result was not saved. The recording is still available on this page; check the browser storage, then try saving again.'); }
    finally { setBusy(false); }
  };
  return (
    <Chrome back="/new">
      <Steps at={2} />
      <h1>Scan CRT</h1>
      <p className="muted">Set up the camera and follow the measurement guide. Keep the hand and device steady.</p>
      {error && <div className="card bad" role="alert"><p>{error}</p>{pending && <button className="btn" disabled={busy} onClick={() => void onCaptured(pending)}>Try saving again</button>}</div>}
      {busy ? <div className="card info" role="status">Analyzing & saving the result…</div> : !pending && <ScanView protocol={protocol} onProtocol={onProtocol} onCaptured={onCaptured} />}
    </Chrome>
  );
}
