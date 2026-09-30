import { useId, useRef, useState } from 'react';
import { assessmentFrom, type PatientForm } from '../../clinical/assess';
import { QSOFA_RANGES } from '../../clinical/qsofa';
import type { ReferralVitals } from '../../referral/template';
import { Chrome, QsofaCard, Steps } from '../components/Cards';
import { useDraft } from '../draft';
import { finishAssessment } from '../finish';
import { go } from '../router';

function parseNum(s: string): number | null {
  if (s.trim() === '') return null;
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

function NumField({
  label,
  hint,
  value,
  onChange,
  error,
  inputMode = 'numeric',
}: {
  label: string;
  hint?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  error?: string;
  inputMode?: 'numeric' | 'decimal';
}) {
  const id = useId();
  const invalid = error || (typeof value === 'number' && !Number.isFinite(value) ? 'Enter a valid number.' : undefined);
  return (
    <label className={`field ${invalid ? 'error' : ''}`}>
      {label}
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      <input
        inputMode={inputMode}
        aria-invalid={!!invalid}
        aria-describedby={[hint ? `${id}-hint` : '', invalid ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
        placeholder="Not measured"
        defaultValue={value === null || value === undefined || Number.isNaN(value) ? '' : String(value)}
        onChange={(e) => onChange(parseNum(e.target.value))}
      />
      {invalid && <span className="err" id={`${id}-error`}>{invalid}</span>}
    </label>
  );
}

export function Vitals() {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const { form, setForm } = useDraft();
  const set = (patch: Partial<PatientForm>) => setForm({ ...form, ...patch });
  const setV = (patch: Partial<ReferralVitals>) => set({ vitals: { ...form.vitals, ...patch } });
  const setC = (patch: Partial<PatientForm['context']>) => set({ context: { ...form.context, ...patch } });
  const { qsofa } = assessmentFrom(form);
  const errOf = (k: 'rr' | 'sbp' | 'gcs') => qsofa.criteria.find((c) => c.key === k)?.error;
  const ageInvalid = form.ageYears !== null && (Number.isNaN(form.ageYears) || form.ageYears < 0 || form.ageYears > 120);
  const invalid = ageInvalid || qsofa.criteria.some((c) => c.error) || Object.values(form.vitals).some((v) => typeof v === 'number' && !Number.isFinite(v));
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setSaveError('');
    try { await finishAssessment({ form, capture: null, simulated: false }); }
    catch { setSaveError('The assessment was not saved. Check the storage space and browser permissions, then try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <Chrome back="/">
      <Steps at={1} />
      <h1>Patient data & vital signs</h1>
      <p className="muted">Leave blank if not yet measured — blank values are not counted as normal.</p>
      <section className="card stack">
        <h2>Assessment identity</h2>
        <div className="grid2">
          <label className="field">
            Patient label <span className="hint">Initials/number — avoid full names</span>
            <input placeholder="Example: P-001" maxLength={80} value={form.patientLabel} onChange={(e) => set({ patientLabel: e.target.value })} />
          </label>
          <NumField label="Age (years)" hint="<18 = child" value={form.ageYears} onChange={(v) => set({ ageYears: v })} error={ageInvalid ? 'Age 0–120.' : undefined} inputMode="decimal" />
        </div>
        <div className="grid2">
          <label className="field">
            Sex
            <select value={form.sex ?? ''} onChange={(e) => set({ sex: (e.target.value || null) as PatientForm['sex'] })}>
              <option value="">—</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </label>
          <label className="field">
            Brief complaint
            <input placeholder="Enter the main complaint" maxLength={500} value={form.complaint} onChange={(e) => set({ complaint: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="card stack">
        <h2>qSOFA</h2>
        <div className="grid2">
          <NumField label="Respiratory rate (/min)" hint={`${QSOFA_RANGES.rr.min}–${QSOFA_RANGES.rr.max}`} value={form.vitals.rr} onChange={(v) => setV({ rr: v })} error={errOf('rr')} />
          <NumField label="Systolic BP (mmHg)" hint={`${QSOFA_RANGES.sbp.min}–${QSOFA_RANGES.sbp.max}`} value={form.vitals.sbp} onChange={(v) => setV({ sbp: v })} error={errOf('sbp')} />
        </div>
        <NumField label="GCS" hint="3–15 (15 = fully alert)" value={form.vitals.gcs} onChange={(v) => setV({ gcs: v })} error={errOf('gcs')} />
      </section>

      <section className="card stack">
        <h2>Other vital signs (optional, for referral)</h2>
        <div className="grid2">
          <NumField label="Diastolic BP (mmHg)" value={form.vitals.dbp} onChange={(v) => setV({ dbp: v })} />
          <NumField label="Pulse (/min)" value={form.vitals.hr} onChange={(v) => setV({ hr: v })} />
          <NumField label="Temperature (°C)" value={form.vitals.tempC} onChange={(v) => setV({ tempC: v })} inputMode="decimal" />
          <NumField label="SpO2 (%)" value={form.vitals.spo2} onChange={(v) => setV({ spo2: v })} />
        </div>
      </section>

      <section className="card">
        <h2>Context</h2>
        <label className="check">
          <input type="checkbox" checked={form.context.obstetric} onChange={(e) => setC({ obstetric: e.target.checked })} />
          Pregnant / postpartum
        </label>
        <label className="check">
          <input type="checkbox" checked={form.context.cold} onChange={(e) => setC({ cold: e.target.checked })} />
          Room or patient's hand is cold
        </label>
        <label className="check">
          <input type="checkbox" checked={form.context.handAtHeartLevel} onChange={(e) => setC({ handAtHeartLevel: e.target.checked })} />
          Patient's hand at heart level during measurement
        </label>
      </section>

      <QsofaCard q={qsofa} />
      {saveError && <div className="card bad" role="alert">{saveError}</div>}
      {invalid && <p role="alert" style={{ color: 'var(--bad)' }}>Check the flagged values before continuing.</p>}

      <div className="fixed-actions">
        <div>
          <button className="btn" onClick={() => void save()} disabled={invalid || saving}>
            {saving ? 'Saving…' : 'Save without CRT'}
          </button>
          <button className="btn primary" onClick={() => go('/scan')} disabled={invalid || saving}>
            Next: Scan CRT →
          </button>
        </div>
      </div>
    </Chrome>
  );
}
