import { toHueSat, toLab } from './color';
import type { RGB, SignalKind } from './types';

/**
 * Candidate per-frame "redness" signals. Convention: the value DROPS when the skin blanches (blood is pushed out),
 * and RISES on re-perfusion. Hemoglobin absorbs green strongly → when blanched, G rises relative to R.
 *
 * Normalization against the reference patch:
 *  - 'ratio': s = k(roi) / k(ref)  — cancels first-order global gain changes (AE).
 *  - 'diff' : s = k(roi) - k(ref)  — for quantities that are already angles/color coordinates.
 */
export interface SignalDef {
  kind: SignalKind;
  label: string;
  mode: 'ratio' | 'diff';
  value: (c: RGB) => number;
}

const EPS = 1e-6;

export const SIGNALS: Record<SignalKind, SignalDef> = {
  rg: { kind: 'rg', label: 'R/G ratio', mode: 'ratio', value: (c) => c.r / Math.max(c.g, EPS) },
  astar: { kind: 'astar', label: 'CIELab a*', mode: 'diff', value: (c) => toLab(c).a },
  // Skin hue sits around red→orange; when blanched the hue shifts toward yellow (rises) → the sign is flipped.
  hue: { kind: 'hue', label: 'Hue (inverted)', mode: 'diff', value: (c) => -toHueSat(c).hue },
  sat: { kind: 'sat', label: 'HSV saturation', mode: 'ratio', value: (c) => toHueSat(c).sat },
  gInv: { kind: 'gInv', label: '1/G', mode: 'ratio', value: (c) => 1 / Math.max(c.g, EPS) },
};

export function signalValue(kind: SignalKind, roi: RGB, ref: RGB | null | undefined): number {
  const def = SIGNALS[kind];
  const v = def.value(roi);
  if (!ref) return v;
  const vr = def.value(ref);
  return def.mode === 'ratio' ? v / (Math.abs(vr) > EPS ? vr : EPS) : v - vr;
}

/**
 * Reference drift range expressed in units comparable to the normalized signal amplitude.
 * ratio: relative range (range/median) versus relative amplitude; diff: absolute range.
 */
export function referenceDriftRatio(kind: SignalKind, refValues: number[], amplitude: number, baseline: number): number {
  if (refValues.length < 2 || amplitude <= 0) return NaN;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of refValues) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  if (SIGNALS[kind].mode === 'ratio') {
    const sorted = [...refValues].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const relRange = range / Math.max(Math.abs(med), EPS);
    const relAmp = amplitude / Math.max(Math.abs(baseline), EPS);
    return relRange / relAmp;
  }
  return range / amplitude;
}
