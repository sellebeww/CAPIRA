/** Pure numeric utilities: resampling, zero-phase filters, robust statistics. */

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Robust SD: 1.4826 × MAD. */
export function robustSD(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}

export function mean(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return values.length ? s / values.length : NaN;
}

export function std(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / (values.length - 1));
}

/** Linear interpolation of ys(xs) onto a uniform grid [x0, x0+dt, ...] up to <= x1. xs must be increasing. */
export function resampleUniform(xs: number[], ys: number[], x0: number, x1: number, dt: number): { t: number[]; y: number[] } {
  const t: number[] = [];
  const y: number[] = [];
  let j = 0;
  const n = Math.floor((x1 - x0) / dt + 1e-9);
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * dt;
    while (j < xs.length - 2 && xs[j + 1] < x) j++;
    const xa = xs[j];
    const xb = xs[Math.min(j + 1, xs.length - 1)];
    const ya = ys[j];
    const yb = ys[Math.min(j + 1, ys.length - 1)];
    const w = xb > xa ? Math.min(1, Math.max(0, (x - xa) / (xb - xa))) : 0;
    t.push(x);
    y.push(ya + (yb - ya) * w);
  }
  return { t, y };
}

/** Median filter with mirror padding (zero-phase, symmetric). */
export function medianFilter(y: number[], window: number): number[] {
  const w = Math.max(1, window | 1);
  const h = w >> 1;
  const n = y.length;
  const out = new Array<number>(n);
  const buf: number[] = new Array(w);
  for (let i = 0; i < n; i++) {
    for (let k = -h; k <= h; k++) buf[k + h] = y[mirror(i + k, n)];
    out[i] = median(buf);
  }
  return out;
}

function mirror(i: number, n: number): number {
  if (n === 1) return 0;
  while (i < 0 || i >= n) {
    if (i < 0) i = -i;
    if (i >= n) i = 2 * (n - 1) - i;
  }
  return i;
}

/** Savitzky-Golay coefficients (least squares) for the `deriv`-th derivative at the center point. */
export function savgolCoefficients(window: number, order: number, deriv = 0): number[] {
  const w = window | 1;
  const h = w >> 1;
  const p = order + 1;
  // A: w × p Vandermonde; solve (AᵀA) c = e_deriv, coeffs = A c × deriv!
  const ata: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let k = -h; k <= h; k++) {
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) ata[i][j] += Math.pow(k, i + j);
  }
  const e = new Array(p).fill(0);
  e[deriv] = 1;
  const c = solve(ata, e);
  let fact = 1;
  for (let i = 2; i <= deriv; i++) fact *= i;
  const coeffs: number[] = [];
  for (let k = -h; k <= h; k++) {
    let s = 0;
    for (let i = 0; i < p; i++) s += c[i] * Math.pow(k, i);
    coeffs.push(s * fact);
  }
  return coeffs;
}

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k <= n; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Symmetric (zero-phase) convolution with mirror padding. */
export function convolveSymmetric(y: number[], coeffs: number[]): number[] {
  const h = coeffs.length >> 1;
  const n = y.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -h; k <= h; k++) s += coeffs[k + h] * y[mirror(i + k, n)];
    out[i] = s;
  }
  return out;
}

export function savgol(y: number[], window: number, order: number): number[] {
  const w = Math.min(window | 1, y.length % 2 ? y.length : y.length - 1);
  if (w <= order) return [...y];
  return convolveSymmetric(y, savgolCoefficients(w, order));
}

/** First index with t[i] >= x (binary search). */
export function lowerBound(t: number[], x: number): number {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The y values within the time range [a, b]. */
export function sliceByTime<T>(t: number[], y: T[], a: number, b: number): T[] {
  const i0 = lowerBound(t, a);
  const i1 = lowerBound(t, b + 1e-12);
  return y.slice(i0, i1);
}

export interface IsoBlock {
  start: number;
  end: number;
  value: number;
}

/** Increasing isotonic regression (Pool-Adjacent-Violators) → constant-valued blocks. A monotone fit with no shape assumption. */
export function isotonicBlocks(y: number[]): IsoBlock[] {
  const blocks: (IsoBlock & { w: number })[] = [];
  y.forEach((v, i) => {
    blocks.push({ start: i, end: i, value: v, w: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
      const b = blocks.pop()!;
      const a = blocks[blocks.length - 1];
      a.value = (a.value * a.w + b.value * b.w) / (a.w + b.w);
      a.w += b.w;
      a.end = b.end;
    }
  });
  return blocks.map(({ start, end, value }) => ({ start, end, value }));
}

export function isotonicIncreasing(y: number[]): number[] {
  const out = new Array<number>(y.length);
  for (const b of isotonicBlocks(y)) for (let i = b.start; i <= b.end; i++) out[i] = b.value;
  return out;
}

function solve3(m: number[][], v: number[]): number[] | null {
  const a = m.map((row, i) => [...row, v[i]]);
  const n = 3;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/**
 * "Hinge" fit: y = c for t < t0; y = c + k·h (+ q·h² for the quadratic model), h = t - t0, for t >= t0.
 * Least squares with a t0 grid over the samples. Used to determine the recovery onset robustly against noise.
 * The quadratic model captures a convex recovery start (slow then fast) as well as a concave one.
 */
export function hingeFit(
  t: number[],
  y: number[],
  minT0: number,
  maxT0: number,
  model: 'linear' | 'quadratic' = 'linear',
): { t0: number; c: number; k: number; q: number } | null {
  let best: { t0: number; c: number; k: number; q: number; sse: number } | null = null;
  const n = t.length;
  if (n < 6) return null;
  const hMax = t[n - 1];
  for (let j = 0; j < n; j++) {
    const t0 = t[j];
    if (t0 < minT0 || t0 > maxT0) continue;
    // Normal equations for the basis [1, h, h²].
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const b = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const h = Math.max(0, t[i] - t0);
      const f = [1, h, h * h];
      for (let r = 0; r < 3; r++) {
        b[r] += f[r] * y[i];
        for (let c = 0; c < 3; c++) S[r][c] += f[r] * f[c];
      }
    }
    let c: number;
    let k: number;
    let q = 0;
    if (model === 'quadratic') {
      const sol = solve3(S, b);
      if (!sol) continue;
      [c, k, q] = sol;
      // Must be increasing over the entire fit range.
      if (k < 0 || k + 2 * q * (hMax - t0) < 0) continue;
    } else {
      const det = S[0][0] * S[1][1] - S[0][1] * S[0][1];
      if (det <= 0) continue;
      k = (S[0][0] * b[1] - S[0][1] * b[0]) / det;
      c = (b[0] - k * S[0][1]) / S[0][0];
      if (k <= 0) continue;
    }
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const h = Math.max(0, t[i] - t0);
      const e = y[i] - (c + k * h + q * h * h);
      sse += e * e;
    }
    if (!best || sse < best.sse) best = { t0, c, k, q, sse };
  }
  return best ? { t0: best.t0, c: best.c, k: best.k, q: best.q } : null;
}
