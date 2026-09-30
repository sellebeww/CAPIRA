/**
 * Camera access. Primary target is Chrome for Android; iOS/desktop are best-effort.
 * All advanced controls (torch, exposure, white balance) are used ONLY when reported as supported
 * by track.getCapabilities(); the outcome of applying them is recorded as-is.
 */

// Camera capability types (Image Capture extensions) are incomplete in the DOM lib.
export type Caps = Record<string, unknown> & {
  torch?: boolean;
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  focusMode?: string[];
  exposureTime?: { min: number; max: number; step: number };
  colorTemperature?: { min: number; max: number; step: number };
  frameRate?: { min: number; max: number };
};

export interface CameraSession {
  stream: MediaStream;
  track: MediaStreamTrack;
  video: HTMLVideoElement;
  caps: Caps;
  /** Control application log: name → 'ok' | 'unsupported' | 'failed: …'. */
  applied: Record<string, string>;
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export async function openCamera(video: HTMLVideoElement): Promise<CameraSession> {
  if (!window.isSecureContext) throw new Error('The camera requires a secure connection (HTTPS or localhost).');
  if (!cameraSupported()) throw new Error('This browser does not support camera access.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
  const track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try { await video.play(); }
  catch (error) { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; throw error; }
  const caps = (track.getCapabilities?.() ?? {}) as Caps;
  return { stream, track, video, caps, applied: {} };
}

export function stopCamera(s: CameraSession | null): void {
  s?.stream.getTracks().forEach((t) => t.stop());
  if (s) s.video.srcObject = null;
}

async function apply(s: CameraSession, name: string, constraint: Record<string, unknown>): Promise<boolean> {
  try {
    await s.track.applyConstraints({ advanced: [constraint as MediaTrackConstraintSet] });
    s.applied[name] = 'ok';
    return true;
  } catch (e) {
    s.applied[name] = `failed: ${(e as Error).message || String(e)}`;
    return false;
  }
}

export async function setTorch(s: CameraSession, on: boolean): Promise<boolean> {
  if (!s.caps.torch) {
    s.applied.torch = 'unsupported';
    return false;
  }
  return apply(s, 'torch', { torch: on });
}

/**
 * Lock exposure & white balance at their current values (if supported) so AE/AWB does not react when the skin blanches.
 * Residual compensation is done by the reference-patch normalization in the engine.
 */
export async function lockExposureAndWhiteBalance(s: CameraSession): Promise<void> {
  const settings = s.track.getSettings() as Record<string, unknown>;
  if (s.caps.exposureMode?.includes('manual')) {
    const c: Record<string, unknown> = { exposureMode: 'manual' };
    if (typeof settings.exposureTime === 'number') c.exposureTime = settings.exposureTime;
    await apply(s, 'exposureLock', c);
  } else s.applied.exposureLock = 'unsupported';
  if (s.caps.whiteBalanceMode?.includes('manual')) {
    const c: Record<string, unknown> = { whiteBalanceMode: 'manual' };
    if (typeof settings.colorTemperature === 'number') c.colorTemperature = settings.colorTemperature;
    await apply(s, 'whiteBalanceLock', c);
  } else s.applied.whiteBalanceLock = 'unsupported';
}

export async function unlockExposureAndWhiteBalance(s: CameraSession): Promise<void> {
  if (s.caps.exposureMode?.includes('continuous')) await apply(s, 'exposureUnlock', { exposureMode: 'continuous' });
  if (s.caps.whiteBalanceMode?.includes('continuous')) await apply(s, 'whiteBalanceUnlock', { whiteBalanceMode: 'continuous' });
}

/** Device/camera summary for metadata (no patient identity). */
export function describeSession(s: CameraSession): Record<string, unknown> {
  const st = s.track.getSettings() as Record<string, unknown>;
  return {
    userAgent: navigator.userAgent,
    trackLabel: s.track.label,
    width: st.width,
    height: st.height,
    frameRateSetting: st.frameRate,
    capabilities: {
      torch: !!s.caps.torch,
      exposureMode: s.caps.exposureMode ?? null,
      whiteBalanceMode: s.caps.whiteBalanceMode ?? null,
      focusMode: s.caps.focusMode ?? null,
    },
    applied: { ...s.applied },
  };
}
