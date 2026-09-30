import { PROTOCOL_TIMING } from '../engine/params';

export type Phase = 'ready' | 'baseline' | 'press' | 'release' | 'done';

export const PHASE_TEXT: Record<Phase, { title: string; instruction: string }> = {
  ready: { title: 'Ready', instruction: 'Aim the camera, place the ROI box on the fingertip pad, then tap Start.' },
  baseline: { title: 'Hold still', instruction: 'Do not press. Measuring the starting color…' },
  press: { title: 'PRESS', instruction: 'Press until pale and hold.' },
  release: { title: 'RELEASE', instruction: 'Release the pressure now. Keep the finger & camera still.' },
  done: { title: 'Done', instruction: 'Analyzing…' },
};

/** Audio cues via WebAudio (no audio files, offline). The AudioContext must be created from a user gesture. */
export class Cue {
  private ctx: AudioContext | null = null;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    void this.ctx?.resume();
  }

  beep(freq: number, durS: number, at = 0) {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const t0 = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    o.start(t0);
    o.stop(t0 + durS + 0.02);
  }

  vibrate(pattern: number | number[]) {
    navigator.vibrate?.(pattern);
  }

  press() {
    this.beep(880, 0.15);
    this.beep(880, 0.15, 0.2);
    this.vibrate([80, 60, 80]);
  }
  release() {
    this.beep(523, 0.6);
    this.vibrate(300);
  }
  tick() {
    this.beep(1200, 0.04);
  }
  done() {
    this.beep(660, 0.1);
    this.beep(880, 0.1, 0.13);
    this.beep(1100, 0.15, 0.26);
  }
}

export interface ProtocolMarkers {
  pressCue: number;
  releaseCue: number;
}

export interface RunnerCallbacks {
  onPhase: (p: Phase, remainingS: number) => void;
  onTick?: (phase: Phase, remainingS: number) => void;
  /** Current time on the frame timeline (seconds). */
  now: () => number;
}

/**
 * Runs the baseline → press → release sequence with standardized cues (K1).
 * Returns the cue time markers on the same timeline as the frame timestamps.
 */
export function runProtocol(cue: Cue, cb: RunnerCallbacks, timing = PROTOCOL_TIMING): { done: Promise<ProtocolMarkers>; cancel: () => void } {
  let cancelled = false;
  let timer: number | undefined;
  let rejectRun: ((e: Error) => void) | null = null;
  const done = new Promise<ProtocolMarkers>((resolve, reject) => {
    rejectRun = reject;
    const markers: Partial<ProtocolMarkers> = {};
    const phases: [Phase, number][] = [
      ['baseline', timing.baselineS],
      ['press', timing.pressS],
      ['release', timing.postReleaseS],
    ];
    let idx = 0;
    let phaseStart = cb.now();
    const enter = (i: number) => {
      const [p, dur] = phases[i];
      phaseStart = cb.now();
      if (p === 'press') {
        markers.pressCue = phaseStart;
        cue.press();
      } else if (p === 'release') {
        markers.releaseCue = phaseStart;
        cue.release();
      }
      cb.onPhase(p, dur);
    };
    enter(0);
    let lastWhole = -1;
    const step = () => {
      if (cancelled) return reject(new Error('cancelled'));
      const [p, dur] = phases[idx];
      const remaining = dur - (cb.now() - phaseStart);
      const whole = Math.ceil(remaining);
      if (whole !== lastWhole) {
        lastWhole = whole;
        cb.onTick?.(p, Math.max(0, remaining));
        if (p === 'press' && whole <= 3 && whole > 0) cue.tick();
      }
      if (remaining <= 0) {
        idx++;
        if (idx >= phases.length) {
          cue.done();
          cb.onPhase('done', 0);
          return resolve(markers as ProtocolMarkers);
        }
        enter(idx);
      }
      timer = window.setTimeout(step, 50);
    };
    timer = window.setTimeout(step, 50);
  });
  return {
    done,
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      rejectRun?.(new Error('cancelled'));
    },
  };
}
