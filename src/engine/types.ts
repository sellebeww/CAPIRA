/** Mean color in linear-light space (0..1), NOT gamma-encoded sRGB. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Pressing protocol (K2).
 * A: press the fingertip pad with a transparent object (glass slide); the camera looks through it.
 * B: non-contact; the operator presses with a finger (covering the ROI); the camera sees the post-release phase.
 * C: contact; the fingertip pad rests on the lens + torch.
 */
export type Protocol = 'A' | 'B' | 'C';

/** Candidate "redness" signals (K: compared in Phase 1). Convention: the value DROPS when blanching. */
export type SignalKind = 'rg' | 'astar' | 'hue' | 'sat' | 'gInv';

export interface FrameSample {
  /** Timestamp in seconds (capture timeline). Not assumed to be uniform. */
  t: number;
  roi: RGB;
  /** Reference skin patch (not pressed) for lighting/WB normalization. */
  ref?: RGB | null;
  /** Mean ROI luma (encoded sRGB, 0..255) — for the brightness gate. */
  luma: number;
  /** Fraction of ROI pixels with any channel >= 250 (0..1). */
  clipFrac: number;
  /** Laplacian variance of the ROI (8-bit grayscale). Absent = not measured. */
  sharpness?: number;
  /** ROI displacement from tracking (px) relative to the starting position. */
  dx?: number;
  dy?: number;
  /** Number of frames skipped before this one (from presentedFrames). */
  dropped?: number;
}

export interface CaptureMarkers {
  /** Time of the "press" cue (seconds, same timeline as the frames). */
  pressCue: number;
  /** Time of the "release" cue. */
  releaseCue: number;
}

export interface CaptureInput {
  frames: FrameSample[];
  markers: CaptureMarkers;
  protocol: Protocol;
  /** ROI side length in px (to normalize motion). */
  roiSizePx?: number;
}

export type CheckCode =
  | 'TOO_FEW_FRAMES'
  | 'LOW_FPS'
  | 'FRAME_DROPS'
  | 'TIMING_JITTER'
  | 'GAP'
  | 'SHORT_BASELINE'
  | 'TOO_DARK'
  | 'TOO_BRIGHT'
  | 'CLIPPING'
  | 'BLUR'
  | 'MOTION'
  | 'REF_DRIFT'
  | 'REF_LUMA_DRIFT'
  | 'NO_BLANCHING'
  | 'LOW_CONTRAST'
  | 'RELEASE_NOT_DETECTED'
  | 'NOISY_RECOVERY'
  | 'NON_MONOTONIC';

export interface QualityCheck {
  code: CheckCode;
  /** Short label. */
  label: string;
  /** Measured value; null = not measured (data unavailable). */
  value: number | null;
  threshold: number;
  /** Pass direction: the value must be >= or <= the threshold. */
  pass: boolean;
  comparator: '>=' | '<=';
  unit?: string;
  /** Message for the user on failure. */
  failMessage: string;
}

export interface CurveData {
  /** Uniform time grid, seconds relative to the start of the recording. */
  t: number[];
  /** Normalized resampled signal (not yet filtered). */
  raw: number[];
  /** After median + Savitzky-Golay (zero-phase). */
  filtered: number[];
  /** Recovery fraction r(t) = (s - trough)/(baseline - trough); null where undefined. */
  recovery: (number | null)[];
  /** Monotone fit (isotonic regression) of r since onset — the basis of the CRT computation. */
  monotoneFit?: (number | null)[];
}

export interface EngineEvents {
  pressCue: number;
  releaseCue: number;
  baseline: number | null;
  trough: number | null;
  amplitude: number | null;
  noiseSD: number | null;
  /** Recovery onset (release) as detected from the signal. */
  release: number | null;
  /** Time at which r >= X is reached (absolute, seconds relative to the start of the recording). */
  recovery: number | null;
}

export interface TimingStats {
  frames: number;
  durationS: number;
  fps: number;
  jitterMs: number;
  dropFrac: number;
  maxGapS: number;
}

export type CrtStatus = 'ok' | 'censored' | 'rejected';

export interface CrtResult {
  status: CrtStatus;
  /** CRT at the primary recovery threshold (params.recoveryX), seconds. Only when status is 'ok'. */
  crt: number | null;
  /** If 'censored': recovery was not reached within a window this long (seconds). */
  censoredAboveS: number | null;
  /** Sensitivity analysis: CRT at several thresholds X (null = not reached). */
  sensitivity: { x: number; crt: number | null }[];
  /** Time to reach 50% recovery — a more robust comparison metric. */
  t50: number | null;
  recoveryX: number;
  checks: QualityCheck[];
  /** Rejection messages (from failed blocking checks). */
  reasons: string[];
  /** Non-blocking warnings. */
  warnings: string[];
  curve: CurveData;
  events: EngineEvents;
  timing: TimingStats;
  signalKind: SignalKind;
  normalized: boolean;
  protocol: Protocol;
}
