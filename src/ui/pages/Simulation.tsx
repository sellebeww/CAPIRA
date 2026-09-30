import { useEffect, useMemo, useRef, useState } from 'react';
import { linearToSrgb } from '../../engine/color';
import { signalValue } from '../../engine/signals';
import { SCENARIOS, scenarioCapture, type Scenario } from '../../sim/scenarios';
import { Chrome } from '../components/Cards';
import { LineChart } from '../components/LineChart';
import { Icon } from '../components/Icon';
import { finishAssessment } from '../finish';

function Playback({ s, onDone }: { s: Scenario; onDone: () => void }) {
  const capture = useMemo(() => scenarioCapture(s), [s]);
  const frames = capture.frames;
  const t0 = frames[0].t;
  const total = frames[frames.length - 1].t - t0;
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const last = useRef(performance.now());
  const done = useRef(false);

  useEffect(() => {
    let raf = 0;
    const step = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setElapsed((e) => Math.min(total, e + dt * speed));
      raf = requestAnimationFrame(step);
    };
    last.current = performance.now();
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [speed, total]);

  useEffect(() => {
    if (elapsed >= total && !done.current) {
      done.current = true;
      onDone();
    }
  }, [elapsed, total, onDone]);

  const shown = frames.filter((f) => f.t - t0 <= elapsed);
  const cur = shown[shown.length - 1] ?? frames[0];
  const x = shown.map((f) => f.t - t0);
  const y = shown.map((f) => signalValue('rg', f.roi, f.ref));
  const all = frames.map((f) => signalValue('rg', f.roi, f.ref));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const press = capture.markers.pressCue - t0;
  const rel = capture.markers.releaseCue - t0;
  const phase = elapsed < press ? 'REST' : elapsed < rel ? 'PRESS' : 'RELEASE';
  const css = (c: { r: number; g: number; b: number }) => `rgb(${linearToSrgb(c.r * 1.6)}, ${linearToSrgb(c.g * 1.6)}, ${linearToSrgb(c.b * 1.6)})`;

  return (
    <div className="stack">
      <div className="card sim">
        <div className="row">
          <b className="grow">{phase}</b>
          <span>{elapsed.toFixed(1)} / {total.toFixed(0)} s</span>
        </div>
        <p className="muted">Synthetic ROI color (brightened for display):</p>
        <div className="swatch" style={{ background: css(cur.roi) }} />
      </div>
      <div className="card">
        <LineChart
          ariaLabel="Synthetic redness signal"
          height={200}
          xDomain={[0, total]}
          yDomain={[lo - (hi - lo) * 0.1, hi + (hi - lo) * 0.1]}
          yTicks={[]}
          xLabel="seconds"
          bands={[
            { x0: 0, x1: press, color: 'rgb(27 127 134 / 8%)', label: 'rest' },
            { x0: press, x1: rel, color: 'rgb(154 82 0 / 8%)', label: 'press' },
            { x0: rel, x1: total, color: 'rgb(47 181 127 / 8%)', label: 'release' },
          ]}
          series={[{ x, y, color: '#d0356a', width: 2.5 }]}
        />
        <p className="muted" style={{ fontSize: '0.85rem' }}>This signal is computer-generated (synthetic generator), not a patient recording.</p>
      </div>
      <div className="row">
        <button className="btn grow" onClick={() => setSpeed(speed === 1 ? 3 : 1)}>{speed === 1 ? 'Speed up 3×' : 'Normal speed'}</button>
        <button className="btn grow" onClick={() => setElapsed(total)}>Skip to the result</button>
      </div>
    </div>
  );
}

export function Simulation() {
  const [sel, setSel] = useState<Scenario | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!sel) return;
    setSaving(true); setError('');
    try { await finishAssessment({ form: sel.form, capture: scenarioCapture(sel), simulated: true, device: { simulation: sel.id } }); }
    catch { setError('The simulation result was not saved. Check the browser storage, then try again.'); }
    finally { setSaving(false); }
  };
  return (
    <Chrome simulated back="/">
      <h1>Simulation Mode</h1>
      {error && <div className="card bad" role="alert"><p>{error}</p><button className="btn" disabled={saving} onClick={() => void save()}>Try saving again</button></div>}
      {!sel ? (
        <>
          <p>
            For demo & training. The CRT signal comes from a <b>synthetic generator</b> and the vital signs are examples — every result is marked SIMULATION.
          </p>
          <div className="scenario-grid">{SCENARIOS.map((s, i) => (
            <button key={s.id} className="card btn scenario-card" onClick={() => setSel(s)}>
              <span className="pill sim">SCENARIO {String(i + 1).padStart(2, '0')}</span>
              <b>{s.title}</b>
              <span className="muted" style={{ fontWeight: 400 }}>{s.description}</span>
              <span className="text-link">Start simulation<Icon name="arrow" size={16} /></span>
            </button>
          ))}</div>
        </>
      ) : (
        <Playback
          s={sel}
          onDone={() => void save()}
        />
      )}
    </Chrome>
  );
}
