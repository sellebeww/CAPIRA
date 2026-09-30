import type { PatientForm } from '../clinical/assess';
import { synthesize, type SynthOptions } from '../engine/synthetic';

/**
 * SIMULATION Mode scenarios (K8). The signal comes from the synthetic generator — NOT a patient recording.
 * Always shown with a "SIMULATION" banner. Vital-sign values are illustrative examples.
 */
export interface Scenario {
  id: string;
  title: string;
  description: string;
  form: PatientForm;
  synth: SynthOptions;
}

const ctx = { cold: false, handAtHeartLevel: true, obstetric: false };

export const SCENARIOS: Scenario[] = [
  {
    id: 'adult-prolonged',
    title: 'Febrile adult, prolonged CRT',
    description: 'Synthetic signal with slow recovery (target ~4 s) + vital signs meeting 2 qSOFA criteria.',
    form: {
      patientLabel: 'SIM-01',
      ageYears: 52,
      sex: 'M',
      complaint: 'Fever for 3 days, weakness (example)',
      vitals: { rr: 26, sbp: 96, dbp: 58, gcs: 15, hr: 118, tempC: 39.1, spo2: 94 },
      context: ctx,
    },
    synth: { seed: 101, crtS: 4, skin: 'medium', noiseSD: 0.0008 },
  },
  {
    id: 'adult-normal',
    title: 'Febrile adult, CRT within limits',
    description: 'Fast recovery (target ~1.8 s), qSOFA 0. A reminder: a score <2 does not mean safe.',
    form: {
      patientLabel: 'SIM-02',
      ageYears: 34,
      sex: 'F',
      complaint: 'Fever for 1 day (example)',
      vitals: { rr: 18, sbp: 118, dbp: 76, gcs: 15, hr: 96, tempC: 38.4, spo2: 98 },
      context: ctx,
    },
    synth: { seed: 202, crtS: 1.8, skin: 'medium', noiseSD: 0.0008 },
  },
  {
    id: 'low-quality',
    title: 'Low data quality (dim light)',
    description: 'An example of honest rejection: the app does not output a CRT number.',
    form: {
      patientLabel: 'SIM-03',
      ageYears: 67,
      sex: 'F',
      complaint: 'Cough, shortness of breath (example)',
      vitals: { rr: 24, sbp: 104, gcs: 14, hr: 104, tempC: 38.0 },
      context: { ...ctx, cold: true },
    },
    synth: { seed: 303, crtS: 3, skin: 'dark', noiseSD: 0.004, brightness: 0.12 },
  },
  {
    id: 'child',
    title: 'Child, CRT threshold 2 s',
    description: 'qSOFA does not apply to children; CRT is compared with the child threshold.',
    form: {
      patientLabel: 'SIM-04',
      ageYears: 6,
      sex: 'M',
      complaint: 'Diarrhea & fever (example)',
      vitals: { rr: 30, sbp: 92, gcs: 15, hr: 140, tempC: 38.8 },
      context: ctx,
    },
    synth: { seed: 404, crtS: 2.7, skin: 'light', noiseSD: 0.0008 },
  },
  {
    id: 'obstetric-incomplete',
    title: 'Postpartum, incomplete data',
    description: 'Blood pressure not yet measured → qSOFA "incomplete"; the obstetric warning appears.',
    form: {
      patientLabel: 'SIM-05',
      ageYears: 27,
      sex: 'F',
      complaint: 'Day 4 postpartum, fever (example)',
      vitals: { rr: 23, gcs: 15, hr: 112, tempC: 38.6 },
      context: { ...ctx, obstetric: true },
    },
    synth: { seed: 505, crtS: 2.4, skin: 'medium', noiseSD: 0.0008 },
  },
];

export function scenarioCapture(s: Scenario) {
  return synthesize(s.synth).input;
}
