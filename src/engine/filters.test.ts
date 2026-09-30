import { describe, expect, it } from 'vitest';
import {
  hingeFit,
  isotonicIncreasing,
  median,
  medianFilter,
  resampleUniform,
  robustSD,
  savgol,
  savgolCoefficients,
} from './filters';

describe('basic statistics', () => {
  it('median of odd/even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it('robustSD ≈ SD for normal data and is outlier-proof', () => {
    const v = Array.from({ length: 1001 }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
    const withOutlier = [...v, 1e6];
    expect(Math.abs(robustSD(withOutlier) - robustSD(v))).toBeLessThan(0.01);
  });
});

describe('resampleUniform', () => {
  it('linear interpolation on non-uniform timestamps', () => {
    const { t, y } = resampleUniform([0, 0.1, 0.35, 0.4], [0, 1, 3.5, 4], 0, 0.4, 0.05);
    expect(t.length).toBe(9);
    y.forEach((v, i) => expect(v).toBeCloseTo(t[i] * 10, 6));
  });
});

describe('Savitzky-Golay', () => {
  it('smoothing coefficients sum to 1 and are symmetric', () => {
    const c = savgolCoefficients(11, 2);
    expect(c.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
    for (let i = 0; i < c.length; i++) expect(c[i]).toBeCloseTo(c[c.length - 1 - i], 10);
  });
  it('preserves a 2nd-order polynomial exactly in the interior', () => {
    const y = Array.from({ length: 50 }, (_, i) => 0.3 * i * i - 2 * i + 5);
    const f = savgol(y, 11, 2);
    for (let i = 5; i < 45; i++) expect(f[i]).toBeCloseTo(y[i], 8);
  });
  it('zero-phase: does not shift the time of a symmetric rising edge', () => {
    const y = Array.from({ length: 200 }, (_, i) => Math.tanh((i - 100) / 8));
    const f = savgol(medianFilter(y, 5), 15, 2);
    // The midpoint (value 0) stays at index 100.
    expect(Math.abs(f[100])).toBeLessThan(1e-9);
  });
});

describe('isotonic regression', () => {
  it('produces a non-decreasing series and preserves the mean', () => {
    const y = [1, 3, 2, 4, 3.5, 5];
    const iso = isotonicIncreasing(y);
    for (let i = 1; i < iso.length; i++) expect(iso[i]).toBeGreaterThanOrEqual(iso[i - 1]);
    expect(iso.reduce((s, v) => s + v, 0)).toBeCloseTo(y.reduce((s, v) => s + v, 0), 10);
    expect(iso).toEqual([1, 2.5, 2.5, 3.75, 3.75, 5]);
  });
});

describe('hingeFit', () => {
  it('finds the onset in plateau + rising-line data', () => {
    const t = Array.from({ length: 90 }, (_, i) => i / 30);
    const y = t.map((x) => (x < 1.5 ? 2 : 2 + 0.8 * (x - 1.5)));
    const fit = hingeFit(t, y, 0.5, 2.5, 'linear');
    expect(fit).not.toBeNull();
    expect(Math.abs(fit!.t0 - 1.5)).toBeLessThan(1 / 30 + 1e-9);
  });
  it('the quadratic model captures a convex start', () => {
    const t = Array.from({ length: 90 }, (_, i) => i / 30);
    const y = t.map((x) => (x < 1.2 ? 0 : 0.5 * (x - 1.2) ** 2 + 0.1 * (x - 1.2)));
    const fit = hingeFit(t, y, 0.5, 2.5, 'quadratic');
    expect(Math.abs(fit!.t0 - 1.2)).toBeLessThan(1 / 30 + 1e-9);
  });
});
