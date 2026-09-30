import type { SignalKind } from './types';

/**
 * Engine parameters. ALL thresholds here are PROVISIONAL: chosen from the literature / synthetic signals,
 * NOT yet calibrated on real camera data (see docs/PROTOCOL.md, Phase 1).
 * Change only with a reason documented in docs/VALIDATION.md.
 */
export interface EngineParams {
  signalKind: SignalKind;
  /** Use the reference patch for normalization when available. */
  useReference: boolean;
  /** Resampling grid frequency (Hz). Original timestamps are not assumed to be uniform. */
  fs: number;
  /** Median filter window (samples, odd). */
  medianWindow: number;
  /** Savitzky-Golay window (seconds) and polynomial order. */
  sgWindowS: number;
  sgOrder: number;
  /** Data source for the isotonic regression: 'median' (median only) or 'sg' (median + Savitzky-Golay). */
  fitSource: 'median' | 'sg';
  /** Savitzky-Golay window for the isotonic-fit data only (seconds) — longer, to suppress noise in the flat tail. */
  fitSgWindowS: number;
  /** Recovery onset model: linear or quadratic hinge. */
  onsetModel: 'linear' | 'quadratic';
  /** Primary recovery threshold X: CRT = time until r >= X since release. */
  recoveryX: number;
  /** Thresholds for the sensitivity analysis. */
  sensitivityX: number[];
  /** r must stay >= X - holdTolerance for holdS after crossing. */
  holdS: number;
  holdTolerance: number;
  /** Discard this many seconds at the edge of the baseline window. */
  baselineGuardS: number;
  minBaselineS: number;
  /** Length of the trough window before release (seconds). */
  troughWindowS: number;
  /** Release search window relative to the "release" cue (seconds). */
  releaseSearchBeforeS: number;
  releaseSearchAfterS: number;
  /** r must pass this value (holding for holdS) for release to count as detected. */
  releaseDetectR: number;
  /** Range of r for the onset tangent-line fit. */
  onsetFitLo: number;
  onsetFitHi: number;
  gates: QualityGates;
}

export interface QualityGates {
  minFrames: number;
  minFps: number;
  maxDropFrac: number;
  maxJitterMs: number;
  /** Maximum gap between frames in the critical window (release→recovery). */
  maxGapS: number;
  minLuma: number;
  maxLuma: number;
  maxClipFrac: number;
  minSharpness: number;
  /** Maximum motion in the critical window, as a fraction of the ROI side. */
  maxMotionFrac: number;
  /** Reference drift range relative to the blanching amplitude. */
  maxRefDriftRatio: number;
  /** Relative range of the reference luminance (AE). */
  maxRefLumaDrift: number;
  /** Minimum relative blanching amplitude versus baseline. */
  minRelAmplitude: number;
  /** Minimum contrast-to-noise ratio: amplitude / baseline noise SD. */
  minCNR: number;
  /** Residual SD in the recovery window relative to amplitude. */
  maxRecoveryNoiseRel: number;
  /** Maximum reverse drop of the filtered recovery curve (fraction of amplitude). */
  maxDrawdown: number;
}

export const DEFAULT_GATES: QualityGates = {
  minFrames: 90,
  minFps: 20,
  maxDropFrac: 0.1,
  maxJitterMs: 15,
  maxGapS: 0.15,
  minLuma: 30,
  maxLuma: 235,
  maxClipFrac: 0.05,
  minSharpness: 10,
  maxMotionFrac: 0.25,
  maxRefDriftRatio: 0.5,
  maxRefLumaDrift: 0.25,
  minRelAmplitude: 0.02,
  minCNR: 12,
  maxRecoveryNoiseRel: 0.15,
  maxDrawdown: 0.25,
};

export const DEFAULT_PARAMS: EngineParams = {
  signalKind: 'rg',
  useReference: true,
  fs: 30,
  medianWindow: 5,
  sgWindowS: 0.5,
  sgOrder: 2,
  fitSource: 'sg',
  fitSgWindowS: 0.5,
  onsetModel: 'quadratic',
  recoveryX: 0.9,
  sensitivityX: [0.8, 0.9, 0.95],
  holdS: 0.3,
  holdTolerance: 0.05,
  baselineGuardS: 0.2,
  minBaselineS: 1.0,
  troughWindowS: 1.5,
  releaseSearchBeforeS: 0.7,
  releaseSearchAfterS: 3.0,
  releaseDetectR: 0.25,
  onsetFitLo: 0.1,
  onsetFitHi: 0.5,
  gates: DEFAULT_GATES,
};

export function withParams(overrides: Partial<Omit<EngineParams, 'gates'>> & { gates?: Partial<QualityGates> } = {}): EngineParams {
  return {
    ...DEFAULT_PARAMS,
    ...overrides,
    gates: { ...DEFAULT_GATES, ...(overrides.gates ?? {}) },
  };
}

/** Protocol phase durations (K1). Rationale: docs/PROTOCOL.md. */
export const PROTOCOL_TIMING = {
  baselineS: 2,
  /** ANDROMEDA-SHOCK: press until blanched then hold 10 s. */
  pressS: 10,
  postReleaseS: 10,
} as const;
