import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeSession,
  lockExposureAndWhiteBalance,
  openCamera,
  setTorch,
  stopCamera,
  unlockExposureAndWhiteBalance,
  type CameraSession,
} from '../../capture/camera';
import { Cue, PHASE_TEXT, runProtocol, type Phase } from '../../capture/protocol';
import { FrameSampler, type Rect } from '../../capture/sampler';
import { signalValue } from '../../engine/signals';
import type { CaptureInput, Protocol } from '../../engine/types';
import { LineChart } from './LineChart';
import { Icon } from './Icon';

export const PROTOCOL_HELP: Record<Protocol, { name: string; steps: string[]; note?: string }> = {
  A: {
    name: 'A — Clear glass/plastic (provisionally recommended)',
    steps: [
      'Place a glass slide or clear plastic on the patient\'s fingertip pad; the camera looks through the glass.',
      'On the PRESS cue: press the glass until the skin is pale, and hold.',
      'On the RELEASE cue: lift the glass quickly, without shifting the finger.',
    ],
    note: 'Follows the ANDROMEDA-SHOCK method (glass slide on the ventral distal phalanx). The final choice awaits Phase 1 data.',
  },
  B: {
    name: 'B — Non-contact (press with a finger)',
    steps: [
      'Point the camera at the patient\'s fingertip pad.',
      'On PRESS: press with your finger (the area will be covered temporarily).',
      'On RELEASE: remove your finger completely from the camera view.',
    ],
    note: 'The start of recovery is covered by the operator\'s finger → CRT tends to be measured shorter.',
  },
  C: {
    name: 'C — Lens contact + torch (experimental)',
    steps: [
      'Turn on the torch. Rest the patient\'s fingertip pad over the rear camera lens.',
      'On PRESS: press the finger onto the lens.',
      'On RELEASE: reduce the pressure without breaking contact.',
    ],
    note: 'Prone to red-channel saturation and uncontrolled pressure.',
  },
};

export interface Captured {
  capture: CaptureInput;
  device: Record<string, unknown>;
  snapshot: string | null;
  endedAt: number;
}

interface Props {
  protocol: Protocol;
  onProtocol?: (p: Protocol) => void;
  experiment?: boolean;
  follow?: boolean;
  lockAeAwb?: boolean;
  onCrop?: (idx: number, t: number, blob: Blob) => void;
  onCaptured: (c: Captured) => void;
  onRunningChange?: (running: boolean) => void;
}

interface Live {
  luma: number;
  clip: number;
  motion: number;
  fps: number;
}

function snapshotOf(video: HTMLVideoElement, roi: Rect, ref: Rect | null): string | null {
  try {
    const w = 320;
    const h = Math.round((video.videoHeight / video.videoWidth) * w);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = c.getContext('2d')!;
    ctx.drawImage(video, 0, 0, w, h);
    const s = w / video.videoWidth;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2fb57f';
    ctx.strokeRect(roi.x * s, roi.y * s, roi.w * s, roi.h * s);
    if (ref) {
      ctx.strokeStyle = '#3b82f6';
      ctx.strokeRect(ref.x * s, ref.y * s, ref.w * s, ref.h * s);
    }
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

export function ScanView({ protocol, onProtocol, experiment = false, follow = false, lockAeAwb = true, onCrop, onCaptured, onRunningChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useRef<CameraSession | null>(null);
  const sampler = useRef<FrameSampler | null>(null);
  const cue = useRef(new Cue());
  const cancelRun = useRef<(() => void) | null>(null);
  const spark = useRef<{ t: number; v: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [roi, setRoi] = useState<{ cx: number; cy: number; size: number } | null>(null);
  const [ref, setRef] = useState<{ cx: number; cy: number } | null>(null);
  const [placing, setPlacing] = useState<'roi' | 'ref'>('roi');
  const [torchOn, setTorchOn] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [remaining, setRemaining] = useState(0);
  const [live, setLive] = useState<Live>({ luma: 0, clip: 0, motion: 0, fps: 0 });
  const [sparkView, setSparkView] = useState<{ t: number; v: number }[]>([]);
  const running = phase !== 'ready';
  useEffect(() => {
    onRunningChange?.(running || starting);
    return () => onRunningChange?.(false);
  }, [running, starting, onRunningChange]);

  const rects = useCallback((): { roi: Rect; ref: Rect | null } | null => {
    if (!roi) return null;
    const r: Rect = { x: roi.cx - roi.size / 2, y: roi.cy - roi.size / 2, w: roi.size, h: roi.size };
    const fs = roi.size * 0.6;
    const f = ref ? { x: ref.cx - fs / 2, y: ref.cy - fs / 2, w: fs, h: fs } : null;
    return { roi: r, ref: f };
  }, [roi, ref]);

  // Open the camera.
  useEffect(() => {
    let alive = true;
    const v = videoRef.current!;
    openCamera(v)
      .then((s) => {
        if (!alive) return stopCamera(s);
        session.current = s;
        const w = v.videoWidth;
        const h = v.videoHeight;
        setDims({ w, h });
        const size = Math.round(Math.min(w, h) * 0.18);
        setRoi({ cx: w / 2, cy: h / 2 - size * 0.4, size });
        setRef({ cx: w / 2, cy: Math.min(h - size, h / 2 + size * 1.4) });
      })
      .catch((e: Error) => { if (alive) setErr(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow the camera in the browser settings.' : e.name === 'NotFoundError' ? 'No camera was detected on this device.' : e.message); });
    return () => {
      alive = false;
      cancelRun.current?.();
      sampler.current?.stop();
      sampler.current = null;
      stopCamera(session.current);
      session.current = null;
    };
  }, [attempt]);

  // The sampler follows the ROI.
  useEffect(() => {
    const v = videoRef.current;
    const r = rects();
    if (!v || !r || !session.current) return;
    if (!FrameSampler.supported(v)) {
      setErr('This browser does not support requestVideoFrameCallback (a recent Chrome/Edge/Safari is required).');
      return;
    }
    if (!sampler.current) {
      const s = new FrameSampler(v, { roi: r.roi, ref: r.ref, follow, onCrop });
      s.onSample = (f) => {
        const val = f.ref ? signalValue('rg', f.roi, f.ref) : signalValue('rg', f.roi, null);
        spark.current.push({ t: f.t, v: val });
        const cut = f.t - 10;
        while (spark.current.length && spark.current[0].t < cut) spark.current.shift();
      };
      s.start();
      sampler.current = s;
    } else if (!sampler.current.recording) {
      sampler.current.setRegions(r.roi, r.ref);
    }
  }, [rects, follow, onCrop]);

  // Update the guidance ~7x/s (not every frame).
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = sampler.current;
      if (!s) return;
      const size = roi?.size ?? 100;
      setLive({ luma: s.live.luma, clip: s.live.clipFrac, motion: s.live.motionPx / size, fps: s.live.fps });
      setSparkView([...spark.current]);
    }, 150);
    return () => clearInterval(id);
  }, [roi?.size]);

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (running || !dims || !videoRef.current) return;
    const el = videoRef.current.getBoundingClientRect();
    const scale = Math.min(el.width / dims.w, el.height / dims.h);
    const ox = (el.width - dims.w * scale) / 2;
    const oy = (el.height - dims.h * scale) / 2;
    const x = (e.clientX - el.left - ox) / scale;
    const y = (e.clientY - el.top - oy) / scale;
    if (x < 0 || y < 0 || x > dims.w || y > dims.h) return;
    if (placing === 'roi' && roi) setRoi({ ...roi, cx: x, cy: y });
    else setRef({ cx: x, cy: y });
  };

  const toggleTorch = async () => {
    const s = session.current;
    if (!s) return;
    const ok = await setTorch(s, !torchOn);
    if (ok) setTorchOn(!torchOn);
  };

  const start = async () => {
    if (startingRef.current || running) return;
    const s = session.current;
    const smp = sampler.current;
    const v = videoRef.current;
    const r = rects();
    if (!s || !smp || !v || !r) return;
    startingRef.current = true;
    setStarting(true);
    cue.current.unlock();
    if (lockAeAwb) await lockExposureAndWhiteBalance(s);
    if (session.current !== s) { startingRef.current = false; return; }
    const snapshot = snapshotOf(v, r.roi, r.ref);
    smp.beginRecording();
    const run = runProtocol(cue.current, {
      now: () => smp.nowS(),
      onPhase: (p, rem) => {
        setPhase(p);
        setRemaining(rem);
      },
      onTick: (_p, rem) => setRemaining(rem),
    });
    cancelRun.current = run.cancel;
    try {
      const markers = await run.done;
      const frames = smp.endRecording();
      const endedAt = performance.now();
      const device = { ...describeSession(s), timestampSource: smp.timestampSource, follow, lockAeAwb, torch: torchOn };
      onCaptured({ capture: { frames, markers, protocol, roiSizePx: smp.roiSizePx }, device, snapshot, endedAt });
      setPhase('ready');
    } catch {
      smp.endRecording();
      setPhase('ready');
    } finally {
      if (lockAeAwb) void unlockExposureAndWhiteBalance(s);
      startingRef.current = false;
      setStarting(false);
      cancelRun.current = null;
    }
  };

  const r = rects();
  const lumaTone = live.luma < 40 ? 'bad' : live.luma < 60 ? 'attn' : live.luma > 235 ? 'bad' : 'ok';
  const clipTone = live.clip > 0.05 ? 'bad' : live.clip > 0.01 ? 'attn' : 'ok';
  const motionTone = live.motion > 0.05 ? 'bad' : live.motion > 0.02 ? 'attn' : 'ok';
  const fpsTone = live.fps >= 24 ? 'ok' : live.fps >= 20 ? 'attn' : 'bad';
  const sparkT0 = sparkView.length ? sparkView[sparkView.length - 1].t - 10 : 0;
  const sv = sparkView.map((p) => p.v);
  const lo = sv.length ? Math.min(...sv) : 0;
  const hi = sv.length ? Math.max(...sv) : 1;

  if (err) return <div className="card"><div className="empty-state"><span className="empty-icon"><Icon name="camera" size={30} /></span><h2>Camera not available yet</h2><p role="alert">{err}</p><div className="row"><button className="btn primary" onClick={() => { setErr(null); setDims(null); setAttempt((a) => a + 1); }}>Try the camera again</button><a className="btn" href="#/simulation">Try the simulation</a></div></div></div>;

  return (
    <div className="stack">
      {!running && (
        <div className="card info">
          <b>{PROTOCOL_HELP[protocol].name}</b>
          <ol style={{ margin: '6px 0', paddingLeft: 20 }}>
            {PROTOCOL_HELP[protocol].steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            General: patient's hand at heart level, phone on a stand (not hand-held), enough light or the torch. Duration ~22 s (rest 2 · press 10 · release 10).
          </p>
          {PROTOCOL_HELP[protocol].note && <p className="muted" style={{ fontSize: '0.85rem' }}>{PROTOCOL_HELP[protocol].note}</p>}
        </div>
      )}
      <div className="cam" onPointerDown={onPointer}>
        <video ref={videoRef} playsInline muted />
        {!dims && <div className="camera-loading" role="status"><Icon name="camera" size={30} /><p>Waiting for camera access…</p><small>Allow the camera in the browser dialog.</small></div>}
        {dims && r && (
          <svg className="overlay" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
            <rect x={r.roi.x} y={r.roi.y} width={r.roi.w} height={r.roi.h} fill="none" stroke="#2fb57f" strokeWidth={Math.max(2, dims.w / 300)} />
            <text x={r.roi.x} y={r.roi.y - 6} fill="#2fb57f" fontSize={dims.w / 30} fontWeight={700}>ROI</text>
            {r.ref && (
              <>
                <rect x={r.ref.x} y={r.ref.y} width={r.ref.w} height={r.ref.h} fill="none" stroke="#3b82f6" strokeWidth={Math.max(2, dims.w / 300)} strokeDasharray="8 6" />
                <text x={r.ref.x} y={r.ref.y - 6} fill="#3b82f6" fontSize={dims.w / 34} fontWeight={700}>REF</text>
              </>
            )}
          </svg>
        )}
        {running && phase !== 'done' && <div className="count">{Math.ceil(remaining)}</div>}
      </div>
      {running && (
        <div className={`phase-panel ${phase}`} role="status" aria-live="assertive">
          <div className="t">{PHASE_TEXT[phase].title}</div>
          <div>{PHASE_TEXT[phase].instruction}</div>
        </div>
      )}

      <div className="guide" aria-label="Real-time guidance">
        <div className={lumaTone}><b>{lumaTone === 'ok' ? 'Good' : live.luma > 235 ? 'Too bright' : 'Dim'}</b>Light</div>
        <div className={clipTone}><b>{(live.clip * 100).toFixed(0)}%</b>Saturated pixels</div>
        <div className={motionTone}><b>{motionTone === 'ok' ? 'Steady' : 'Shaky'}</b>Stability</div>
        <div className={fpsTone}><b>{live.fps.toFixed(0)}</b>fps</div>
      </div>

      {sparkView.length > 5 && (
        <div className="card" style={{ padding: 8 }}>
          <LineChart
            ariaLabel="Live redness signal"
            height={110}
            xDomain={[0, 10]}
            yDomain={[lo - (hi - lo) * 0.1 - 1e-4, hi + (hi - lo) * 0.1 + 1e-4]}
            yTicks={[]}
            series={[{ x: sparkView.map((p) => p.t - sparkT0), y: sv, color: '#d0356a', width: 2 }]}
          />
          <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>Live redness signal (normalized R/G) — drops when pale, rises on recovery.</p>
        </div>
      )}

      {!running && (
        <>
          <div className="row">
            <span className="muted">Tap the video to place:</span>
            <button className={`btn small ${placing === 'roi' ? 'primary' : ''}`} onClick={() => setPlacing('roi')}>ROI (pressed area)</button>
            <button className={`btn small ${placing === 'ref' ? 'primary' : ''}`} onClick={() => setPlacing('ref')}>Reference skin</button>
          </div>
          {roi && dims && (
            <label className="field">
              ROI size
              <input type="range" min={Math.round(Math.min(dims.w, dims.h) * 0.06)} max={Math.round(Math.min(dims.w, dims.h) * 0.4)} value={roi.size} onChange={(e) => setRoi({ ...roi, size: Number(e.target.value) })} />
            </label>
          )}
          <div className="row">
            <label className="field grow">
              Protocol
              <select value={protocol} onChange={(e) => onProtocol?.(e.target.value as Protocol)}>
                <option value="A">A — clear glass/plastic</option>
                <option value="B">B — non-contact</option>
                <option value="C">C — lens contact + torch</option>
              </select>
            </label>
            <button className="btn" onClick={toggleTorch} disabled={!session.current?.caps.torch} title={session.current?.caps.torch ? '' : 'The torch is not supported by this device/browser'}>
              {torchOn ? 'Torch: on' : 'Torch: off'}
            </button>
          </div>
          {experiment && session.current && (
            <details>
              <summary>Camera capabilities</summary>
              <pre className="kbd">{JSON.stringify(describeSession(session.current), null, 2)}</pre>
            </details>
          )}
          <button className="btn primary block" onClick={start} disabled={!sampler.current || starting}>
            {starting ? 'Preparing the measurement…' : 'Start measurement (~22 s)'}
          </button>
        </>
      )}
      {running && phase !== 'done' && (
        <button className="btn danger block" onClick={() => cancelRun.current?.()}>
          Cancel
        </button>
      )}
    </div>
  );
}
