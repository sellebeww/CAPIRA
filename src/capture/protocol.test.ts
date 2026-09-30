import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cue, runProtocol, type Phase } from './protocol';

describe('protocol runner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { vibrate: () => true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('phase order & cue time markers', async () => {
    let now = 100;
    const phases: Phase[] = [];
    const run = runProtocol(new Cue(), { now: () => now, onPhase: (p) => phases.push(p) }, { baselineS: 2, pressS: 10, postReleaseS: 10 });
    for (let i = 0; i < 500; i++) {
      now += 0.05;
      await vi.advanceTimersByTimeAsync(50);
    }
    const m = await run.done;
    expect(phases).toEqual(['baseline', 'press', 'release', 'done']);
    // Marker = the ACTUAL cue time; phase duration ≥ nominal and ≤ nominal + polling interval (50 ms).
    expect(m.pressCue - 100).toBeGreaterThanOrEqual(2);
    expect(m.pressCue - 100).toBeLessThanOrEqual(2.051);
    expect(m.releaseCue - m.pressCue).toBeGreaterThanOrEqual(10);
    expect(m.releaseCue - m.pressCue).toBeLessThanOrEqual(10.051);
  });

  it('cancelling rejects the promise immediately (the UI does not hang)', async () => {
    const run = runProtocol(new Cue(), { now: () => 0, onPhase: () => undefined });
    run.cancel();
    await expect(run.done).rejects.toThrow(/cancelled/);
  });
});
