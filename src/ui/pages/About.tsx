import { useState } from 'react';
import { CRT_THRESHOLDS_S } from '../../clinical/crt';
import { QSOFA_SCOPE_NOTE } from '../../clinical/qsofa';
import { DISCLAIMER } from '../../clinical/recommendation';
import { PROTOCOL_TIMING } from '../../engine/params';
import { deleteAllData } from '../../storage/db';
import { Chrome } from '../components/Cards';

export function About() {
  const [message, setMessage] = useState('');
  return (
    <Chrome back="/">
      <h1>About CAPIRA</h1>
      <section className="card attn">
        <b>{DISCLAIMER}</b>
        <p>CAPIRA does not diagnose sepsis or shock. The app shows findings (measured CRT, qSOFA score) together with their evidence to support the health worker's decision.</p>
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol>
          <li>The nurse enters vital signs → the qSOFA score is computed deterministically (Sepsis-3).</li>
          <li>
            CRT scan ~{PROTOCOL_TIMING.baselineS + PROTOCOL_TIMING.pressS + PROTOCOL_TIMING.postReleaseS} s: rest {PROTOCOL_TIMING.baselineS} s → press {PROTOCOL_TIMING.pressS} s →
            release {PROTOCOL_TIMING.postReleaseS} s, guided by sound.
          </li>
          <li>
            The app reads the mean color of the pressed area (ROI) and of the reference skin in every camera frame, computes a normalized redness ratio, then
            finds the moment of release and the time until the color recovers {90}% (CRT). This is signal processing, not a trained AI model, and it does not measure oxygen saturation.
          </li>
          <li>If the data quality does not meet the requirements, the app refuses to give a number and explains why.</li>
        </ol>
      </section>

      <section className="card">
        <h2>Thresholds used</h2>
        <ul>
          <li>Adult CRT: &gt; {CRT_THRESHOLDS_S.adult} s = prolonged (ANDROMEDA-SHOCK trial threshold).</li>
          <li>
            Child CRT: &gt; {CRT_THRESHOLDS_S.child} s (upper limit of normal at the finger per the Fleming 2015 systematic review; some guidelines use ≥3 s).
          </li>
          <li>qSOFA: RR ≥22, GCS &lt;15, systolic ≤100. {QSOFA_SCOPE_NOTE}</li>
        </ul>
      </section>

      <section className="card">
        <h2>Limitations</h2>
        <ul>
          <li>Accuracy on patients is <b>not validated</b>. Calculation accuracy is only proven on synthetic signals; healthy subjects do not prove detection of critical conditions.</li>
          <li>Quality thresholds are still provisional (not yet calibrated on real camera data).</li>
          <li>Blanching contrast is lower on dark skin → rejection is more frequent. The rejection rate is reported as it is.</li>
          <li>CRT is affected by temperature, age, hand position, and the force & duration of pressure. The app cannot control pressure force.</li>
          <li>The ROI is chosen by the user (not automatic nail segmentation). Nail polish has no effect when the fingertip pad is what is measured.</li>
          <li>Web cameras do not always allow exposure/white-balance locking; residual changes are compensated by the reference patch and checked by the drift gate.</li>
          <li>Referral facility data is MOCK.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Privacy</h2>
        <ul>
          <li>All processing happens on the device; the core flow makes no network requests.</li>
          <li>Stored: the derived per-frame color signal, one small thumbnail of the finger area, and the data you enter. Video is not stored.</li>
          <li>Per-frame ROI crops are stored only if enabled on the Experiment page (for annotation, with the subject's consent).</li>
        </ul>
        <button
          className="btn danger"
          onClick={async () => {
            if (confirm('Delete ALL CAPIRA data on this device?')) {
              try { await deleteAllData(); setMessage('All local data was deleted.'); }
              catch { setMessage('The data could not be deleted. Check the browser storage permissions and try again.'); }
            }
          }}
        >
          Delete all data
        </button>
        {message && <p role="status">{message}</p>}
      </section>
      <p className="muted">Version {__APP_VERSION__}</p>
    </Chrome>
  );
}
