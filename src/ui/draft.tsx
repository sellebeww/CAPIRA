import { createContext, useContext, useState, type ReactNode } from 'react';
import { EMPTY_FORM, type PatientForm } from '../clinical/assess';

/** State of the assessment in progress (in memory; saved to IndexedDB once the result is ready). */
interface Draft {
  form: PatientForm;
  setForm: (f: PatientForm) => void;
  reset: () => void;
  /** performance.now() when capture finished — used to measure result latency. */
  captureEndedAt: number | null;
  setCaptureEndedAt: (v: number | null) => void;
}

const Ctx = createContext<Draft | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [captureEndedAt, setCaptureEndedAt] = useState<number | null>(null);
  return (
    <Ctx.Provider value={{ form, setForm, reset: () => setForm(EMPTY_FORM), captureEndedAt, setCaptureEndedAt }}>{children}</Ctx.Provider>
  );
}

export function useDraft(): Draft {
  const d = useContext(Ctx);
  if (!d) throw new Error('DraftProvider missing');
  return d;
}
