import { SRGB_TO_LINEAR_LUT } from '../engine/color';
import type { FrameSample } from '../engine/types';

/** Rectangle in video pixel coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TimestampSource = 'captureTime' | 'mediaTime' | 'callbackNow';

export interface SamplerOptions {
  roi: Rect;
  ref: Rect | null;
  /** true: the ROI follows the tracked motion; false: the ROI stays fixed, motion is only measured. */
  follow: boolean;
  /** Save the ROI crop (PNG) per frame — for annotation only (debug toggle). */
  onCrop?: (idx: number, t: number, blob: Blob) => void;
}

export interface LiveStats {
  luma: number;
  clipFrac: number;
  motionPx: number;
  fps: number;
}

type RVFCMeta = {
  mediaTime: number;
  presentedFrames: number;
  captureTime?: number;
  expectedDisplayTime: number;
};
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: RVFCMeta) => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
};

const ROI_MAX = 96;
const REF_MAX = 48;
const TRACK = 32; // tracking template size
const SEARCH = 8; // search range (px in the tracking grid)

function makeCanvas(w: number, h: number): { ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D; canvas: HTMLCanvasElement | OffscreenCanvas } {
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return { ctx, canvas };
}

/** Mean color statistics (linear) + saturated fraction + luma + grayscale. */
function regionStats(data: Uint8ClampedArray) {
  let r = 0, g = 0, b = 0, luma = 0, clip = 0;
  const n = data.length / 4;
  const gray = new Float32Array(n);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    r += SRGB_TO_LINEAR_LUT[R];
    g += SRGB_TO_LINEAR_LUT[G];
    b += SRGB_TO_LINEAR_LUT[B];
    const y = 0.299 * R + 0.587 * G + 0.114 * B;
    luma += y;
    gray[p] = y;
    if (R >= 250 || G >= 250 || B >= 250) clip++;
  }
  return { rgb: { r: r / n, g: g / n, b: b / n }, luma: luma / n, clipFrac: clip / n, gray };
}

/** Laplacian variance (sharpness indicator). */
function laplacianVar(gray: Float32Array, w: number, h: number): number {
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      s += l;
      s2 += l * l;
      n++;
    }
  if (!n) return 0;
  const m = s / n;
  return s2 / n - m * m;
}

function normalize(patch: Float32Array): Float32Array {
  let m = 0;
  for (const v of patch) m += v;
  m /= patch.length;
  let sd = 0;
  for (const v of patch) sd += (v - m) * (v - m);
  sd = Math.sqrt(sd / patch.length) || 1;
  return patch.map((v) => (v - m) / sd);
}

/**
 * LIVE frame sampler: reads pixels directly from the camera stream (not from MediaRecorder output,
 * because compression alters colors). Timestamps come from requestVideoFrameCallback.
 */
export class FrameSampler {
  private video: VideoWithRVFC;
  private opts: SamplerOptions;
  private handle: number | null = null;
  private roiC = makeCanvas(1, 1);
  private refC = makeCanvas(1, 1);
  private trkC = makeCanvas(TRACK + 2 * SEARCH, TRACK + 2 * SEARCH);
  private template: Float32Array | null = null;
  private lastPresented: number | null = null;
  private mediaOffsetMs: number | null = null;
  private offset = { x: 0, y: 0 };
  private recentT: number[] = [];
  recording = false;
  frames: FrameSample[] = [];
  timestampSource: TimestampSource = 'callbackNow';
  live: LiveStats = { luma: 0, clipFrac: 0, motionPx: 0, fps: 0 };
  onSample?: (f: FrameSample) => void;

  constructor(video: HTMLVideoElement, opts: SamplerOptions) {
    this.video = video as VideoWithRVFC;
    this.opts = opts;
  }

  static supported(video: HTMLVideoElement): boolean {
    return typeof (video as VideoWithRVFC).requestVideoFrameCallback === 'function';
  }

  setRegions(roi: Rect, ref: Rect | null) {
    this.opts = { ...this.opts, roi, ref };
    this.template = null;
    this.offset = { x: 0, y: 0 };
  }

  get roiSizePx(): number {
    return Math.min(this.opts.roi.w, this.opts.roi.h);
  }

  start() {
    const loop = (now: number, meta: RVFCMeta) => {
      this.process(now, meta);
      this.handle = this.video.requestVideoFrameCallback!(loop);
    };
    this.handle = this.video.requestVideoFrameCallback!(loop);
  }

  stop() {
    if (this.handle !== null) this.video.cancelVideoFrameCallback?.(this.handle);
    this.handle = null;
  }

  /** Start recording: reset the buffer & tracking template. Times are in seconds on the performance.now() timeline. */
  beginRecording() {
    this.frames = [];
    this.template = null;
    this.offset = { x: 0, y: 0 };
    this.recording = true;
  }

  endRecording(): FrameSample[] {
    this.recording = false;
    return this.frames;
  }

  /** "Now" on the same timeline as the frame timestamps (seconds). */
  nowS(): number {
    return performance.now() / 1000;
  }

  private timestamp(now: number, meta: RVFCMeta): number {
    if (typeof meta.captureTime === 'number' && meta.captureTime > 0) {
      this.timestampSource = 'captureTime';
      return meta.captureTime / 1000;
    }
    if (typeof meta.mediaTime === 'number' && meta.mediaTime > 0) {
      // Align mediaTime to the performance.now() timeline with a constant offset (first frame).
      if (this.mediaOffsetMs === null) this.mediaOffsetMs = now - meta.mediaTime * 1000;
      this.timestampSource = 'mediaTime';
      return (meta.mediaTime * 1000 + this.mediaOffsetMs) / 1000;
    }
    this.timestampSource = 'callbackNow';
    return now / 1000;
  }

  private process(now: number, meta: RVFCMeta) {
    const t = this.timestamp(now, meta);
    const dropped = this.lastPresented === null ? 0 : Math.max(0, meta.presentedFrames - this.lastPresented - 1);
    this.lastPresented = meta.presentedFrames;
    this.recentT.push(t);
    while (this.recentT.length > 31) this.recentT.shift();
    if (this.recentT.length > 2) this.live.fps = (this.recentT.length - 1) / (this.recentT[this.recentT.length - 1] - this.recentT[0]);

    const { roi, ref } = this.opts;
    const motion = this.track(roi);
    const ox = this.opts.follow ? motion.x : 0;
    const oy = this.opts.follow ? motion.y : 0;

    const rw = Math.max(4, Math.min(ROI_MAX, Math.round(roi.w)));
    const rh = Math.max(4, Math.min(ROI_MAX, Math.round(roi.h)));
    const rc = this.roiC;
    if (rc.canvas.width !== rw || rc.canvas.height !== rh) Object.assign(rc.canvas, { width: rw, height: rh });
    rc.ctx.drawImage(this.video, roi.x + ox, roi.y + oy, roi.w, roi.h, 0, 0, rw, rh);
    const roiStats = regionStats(rc.ctx.getImageData(0, 0, rw, rh).data);
    const sharpness = laplacianVar(roiStats.gray, rw, rh);

    let refRgb = null;
    if (ref) {
      const fw = Math.max(4, Math.min(REF_MAX, Math.round(ref.w)));
      const fh = Math.max(4, Math.min(REF_MAX, Math.round(ref.h)));
      const fc = this.refC;
      if (fc.canvas.width !== fw || fc.canvas.height !== fh) Object.assign(fc.canvas, { width: fw, height: fh });
      fc.ctx.drawImage(this.video, ref.x + ox, ref.y + oy, ref.w, ref.h, 0, 0, fw, fh);
      refRgb = regionStats(fc.ctx.getImageData(0, 0, fw, fh).data).rgb;
    }

    this.live.luma = roiStats.luma;
    this.live.clipFrac = roiStats.clipFrac;
    this.live.motionPx = this.recording ? Math.hypot(motion.x, motion.y) : this.liveShiftPx;

    const sample: FrameSample = {
      t,
      roi: roiStats.rgb,
      ref: refRgb,
      luma: roiStats.luma,
      clipFrac: roiStats.clipFrac,
      sharpness,
      dx: motion.x,
      dy: motion.y,
      dropped,
    };
    if (this.recording) {
      this.frames.push(sample);
      if (this.opts.onCrop && 'convertToBlob' in rc.canvas) {
        const idx = this.frames.length - 1;
        (rc.canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' }).then((b) => this.opts.onCrop?.(idx, t, b));
      }
    }
    this.onSample?.(sample);
  }

  private liveCount = 0;
  private liveShiftPx = 0;

  /**
   * Estimate the ROI shift (video px) via NCC block matching on grayscale (no per-candidate allocation).
   * While recording: template = first recorded frame, shift is accumulated (used by the MOTION gate).
   * Outside recording: only measures momentary shake for real-time guidance.
   */
  private track(roi: Rect): { x: number; y: number } {
    const scale = TRACK / Math.min(roi.w, roi.h);
    const side = TRACK + 2 * SEARCH;
    const srcSide = side / scale;
    const cx = roi.x + roi.w / 2 + (this.recording ? this.offset.x : 0);
    const cy = roi.y + roi.h / 2 + (this.recording ? this.offset.y : 0);
    const tc = this.trkC;
    tc.ctx.drawImage(this.video, cx - srcSide / 2, cy - srcSide / 2, srcSide, srcSide, 0, 0, side, side);
    const d = tc.ctx.getImageData(0, 0, side, side).data;
    const gray = this.grayBuf ?? (this.grayBuf = new Float32Array(side * side));
    for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

    if (!this.template) {
      const tpl = new Float32Array(TRACK * TRACK);
      for (let y = 0; y < TRACK; y++) for (let x = 0; x < TRACK; x++) tpl[y * TRACK + x] = gray[(y + SEARCH) * side + (x + SEARCH)];
      this.template = normalize(tpl);
      return this.recording ? { ...this.offset } : { x: 0, y: 0 };
    }
    const tpl = this.template;
    const N = TRACK * TRACK;
    let best = -Infinity, bx = 0, by = 0;
    for (let oy = -SEARCH; oy <= SEARCH; oy++)
      for (let ox = -SEARCH; ox <= SEARCH; ox++) {
        let sp = 0, spp = 0, spt = 0;
        for (let y = 0; y < TRACK; y++) {
          const row = (y + SEARCH + oy) * side + SEARCH + ox;
          const trow = y * TRACK;
          for (let x = 0; x < TRACK; x++) {
            const v = gray[row + x];
            sp += v;
            spp += v * v;
            spt += v * tpl[trow + x];
          }
        }
        const varp = spp / N - (sp / N) ** 2;
        const ncc = varp > 1e-6 ? spt / Math.sqrt(varp) : -Infinity; // zero-mean template → Σt = 0
        if (ncc > best) {
          best = ncc;
          bx = ox;
          by = oy;
        }
      }
    const step = { x: bx / scale, y: by / scale };
    if (this.recording) {
      this.offset = { x: this.offset.x + step.x, y: this.offset.y + step.y };
      return { ...this.offset };
    }
    this.liveShiftPx = Math.hypot(step.x, step.y);
    if (++this.liveCount % 10 === 0) this.template = null; // refresh the template every ~1/3 s
    return { x: 0, y: 0 };
  }
  private grayBuf: Float32Array | null = null;
}
