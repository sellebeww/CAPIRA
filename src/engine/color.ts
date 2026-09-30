import type { RGB } from './types';

/** 8-bit sRGB → linear 0..1. */
export function srgbToLinear(v8: number): number {
  const c = v8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear 0..1 → sRGB 0..255 (not rounded). */
export function linearToSrgb(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  const e = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return e * 255;
}

/** 256-entry LUT for fast per-pixel conversion. */
export const SRGB_TO_LINEAR_LUT: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i);
  return lut;
})();

/** Rec.601 luma from a linear color (returned on the sRGB 0..255 scale). */
export function lumaOf(c: RGB): number {
  return 0.299 * linearToSrgb(c.r) + 0.587 * linearToSrgb(c.g) + 0.114 * linearToSrgb(c.b);
}

/** Relative luminance Y (linear). */
export function luminance(c: RGB): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function labF(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}

/** Linear sRGB (D65) → CIELab. */
export function toLab(c: RGB): { L: number; a: number; b: number } {
  const X = 0.4124564 * c.r + 0.3575761 * c.g + 0.1804375 * c.b;
  const Y = 0.2126729 * c.r + 0.7151522 * c.g + 0.072175 * c.b;
  const Z = 0.0193339 * c.r + 0.119192 * c.g + 0.9503041 * c.b;
  const fx = labF(X / 0.95047);
  const fy = labF(Y / 1.0);
  const fz = labF(Z / 1.08883);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Hue (degrees, -180..180 centered on red) and HSV saturation from a linear color (computed on encoded sRGB). */
export function toHueSat(c: RGB): { hue: number; sat: number } {
  const r = linearToSrgb(c.r) / 255;
  const g = linearToSrgb(c.g) / 255;
  const b = linearToSrgb(c.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  if (h > 180) h -= 360;
  return { hue: h, sat: max > 0 ? d / max : 0 };
}
