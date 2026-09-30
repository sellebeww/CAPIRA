import { CRT_THRESHOLDS_S } from '../../clinical/crt';
import { SIGNALS } from '../../engine/signals';
import type { CrtResult, QualityCheck } from '../../engine/types';
import { LineChart, type VLine } from './LineChart';

const C = {
  raw: '#8aa4ab',
  filt: '#1b7f86',
  fit: '#2fb57f',
  release: '#0e4a5c',
  adult: '#9a5200',
  child: '#6b3fa0',
  rec: '#d0356a',
};

const PROTOCOL_NAME: Record<string, string> = {
  A: 'A — press with clear glass/plastic',
  B: 'B — non-contact',
  C: 'C — lens contact + torch',
};

export const fmtS = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '—' : `${v.toFixed(d)} s`);

/** Re-perfusion curve relative to release, with 2 s & 3 s threshold lines (K3, 9A). */
export function RecoveryChart({ crt }: { crt: CrtResult }) {
  const { curve, events } = crt;
  if (events.release === null) return null;
  const rel = events.release;
  const x = curve.t.map((t) => t - rel);
  const end = curve.t[curve.t.length - 1] - rel;
  const vlines: VLine[] = [
    { x: 0, label: 'Release', color: C.release },
    { x: CRT_THRESHOLDS_S.child, label: '2 s (child)', color: C.child, dash: '5 4' },
    { x: CRT_THRESHOLDS_S.adult, label: '3 s (adult)', color: C.adult, dash: '5 4' },
  ];
  if (crt.crt !== null) vlines.push({ x: crt.crt, label: `CRT ${crt.crt.toFixed(1)}`, color: C.rec });
  return (
    <div>
      <LineChart
        ariaLabel="Color recovery curve after the pressure is released"
        xDomain={[-1, Math.max(4, Math.min(end, 10))]}
        yDomain={[-0.2, 1.2]}
        yTicks={[0, 0.5, 1]}
        xLabel="seconds since release"
        series={[
          { x, y: curve.recovery.map((v, i) => (v === null ? null : (curve.raw[i] - (events.trough ?? 0)) / (events.amplitude || 1))), color: C.raw, width: 1, opacity: 0.6, label: 'raw' },
          { x, y: curve.recovery, color: C.filt, width: 2.5, label: 'filtered' },
          ...(curve.monotoneFit ? [{ x, y: curve.monotoneFit, color: C.fit, width: 3, dash: '7 4', step: true, label: 'monotone fit' }] : []),
        ]}
        hlines={[
          { y: crt.recoveryX, label: `recovery ${Math.round(crt.recoveryX * 100)}%`, color: C.rec },
          { y: 0, color: C.raw, dash: '1 3' },
          { y: 1, label: 'starting color', color: C.raw, dash: '1 3' },
        ]}
        vlines={vlines}
      />
      <div className="legend">
        <span><i style={{ background: C.raw }} />raw</span>
        <span><i style={{ background: C.filt }} />filtered (zero-phase)</span>
        <span><i style={{ background: C.fit }} />monotone fit (basis of the calculation)</span>
      </div>
    </div>
  );
}

/** Whole recording: baseline / press / release phases. */
export function FullRecordingChart({ crt }: { crt: CrtResult }) {
  const { curve, events } = crt;
  if (!curve.t.length) return <p className="muted">No curve data.</p>;
  const ys = curve.filtered.filter((v) => Number.isFinite(v));
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = (hi - lo) * 0.15 || 0.01;
  const end = curve.t[curve.t.length - 1];
  return (
    <LineChart
      ariaLabel="Color signal over the whole recording"
      height={180}
      xDomain={[0, end]}
      yDomain={[lo - pad, hi + pad]}
      xLabel="seconds"
      bands={[
        { x0: 0, x1: events.pressCue, color: 'rgb(27 127 134 / 8%)', label: 'rest' },
        { x0: events.pressCue, x1: events.releaseCue, color: 'rgb(154 82 0 / 8%)', label: 'press' },
        { x0: events.releaseCue, x1: end, color: 'rgb(47 181 127 / 8%)', label: 'release' },
      ]}
      series={[
        { x: curve.t, y: curve.raw, color: C.raw, width: 1, opacity: 0.6 },
        { x: curve.t, y: curve.filtered, color: C.filt, width: 2.2 },
      ]}
      hlines={[
        ...(events.baseline !== null ? [{ y: events.baseline, label: 'baseline', color: C.release }] : []),
        ...(events.trough !== null ? [{ y: events.trough, label: 'trough', color: C.adult }] : []),
      ]}
      vlines={events.release !== null ? [{ x: events.release, label: 'onset', color: C.rec }] : []}
    />
  );
}

function fmtVal(c: QualityCheck) {
  if (c.value === null) return 'not measured';
  if (c.code === 'RELEASE_NOT_DETECTED') return c.value >= 1 ? 'yes' : 'no';
  const v = Math.abs(c.value) >= 100 ? c.value.toFixed(0) : Math.abs(c.value) >= 10 ? c.value.toFixed(1) : c.value.toFixed(2);
  return `${v}${c.unit ? ' ' + c.unit : ''}`;
}

export function QualityTable({ checks }: { checks: QualityCheck[] }) {
  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead>
          <tr>
            <th>Check</th>
            <th>Value</th>
            <th>Requirement</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.code}>
              <td>{c.label}</td>
              <td>{fmtVal(c)}</td>
              <td className="muted">
                {c.code === 'RELEASE_NOT_DETECTED' ? 'detected' : `${c.comparator} ${String(c.threshold)}${c.unit ? ' ' + c.unit : ''}`}
              </td>
              <td>{c.value === null ? <span className="pill muted">–</span> : c.pass ? <span className="pill ok">pass</span> : <span className="pill bad">fail</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Quality thresholds are provisional (calibrated on synthetic signals, not yet on real camera data). See docs/VALIDATION.md.
      </p>
    </div>
  );
}

/** Full explanation panel (9A): curve, ROI, thresholds, quality, protocol, sensitivity. */
export function ExplainPanel({ crt, snapshot, latencyMs, device }: { crt: CrtResult; snapshot?: string | null; latencyMs?: number | null; device?: Record<string, unknown> | null }) {
  const t = crt.timing;
  return (
    <div className="stack">
      {crt.events.release !== null && (
        <section>
          <h3>Re-perfusion curve</h3>
          <RecoveryChart crt={crt} />
        </section>
      )}
      <section>
        <h3>Whole recording</h3>
        <FullRecordingChart crt={crt} />
      </section>
      {snapshot && (
        <section>
          <h3>Analyzed area</h3>
          <img src={snapshot} alt="Camera thumbnail with the ROI box (green) and the reference skin (blue)" style={{ width: '100%', borderRadius: 10 }} />
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Green = the pressed ROI; blue = reference skin (light normalization). The ROI is chosen by the user — not automatic nail segmentation.
          </p>
        </section>
      )}
      {crt.status !== 'rejected' && (
        <section>
          <h3>Sensitivity analysis</h3>
          <table className="tbl">
            <tbody>
              {crt.sensitivity.map((s) => (
                <tr key={s.x}>
                  <td>Recovery {Math.round(s.x * 100)}%{s.x === crt.recoveryX ? ' (primary)' : ''}</td>
                  <td>{s.crt === null ? 'not reached' : fmtS(s.crt)}</td>
                </tr>
              ))}
              <tr>
                <td>t50 (50%, more robust)</td>
                <td>{fmtS(crt.t50)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
      <section>
        <h3>Quality checks</h3>
        <QualityTable checks={crt.checks} />
      </section>
      <section>
        <h3>Method</h3>
        <table className="tbl">
          <tbody>
            <tr><td>Protocol</td><td>{PROTOCOL_NAME[crt.protocol]}</td></tr>
            <tr><td>Signal</td><td>{SIGNALS[crt.signalKind].label}{crt.normalized ? ', normalized to the reference skin' : ', not normalized'}</td></tr>
            <tr><td>Frames</td><td>{t.frames} frames, {t.fps.toFixed(1)} fps, jitter {t.jitterMs.toFixed(1)} ms, dropped {(t.dropFrac * 100).toFixed(1)}%</td></tr>
            {latencyMs != null && <tr><td>Result latency (measured)</td><td>{Math.round(latencyMs)} ms from the end of recording until the result is shown</td></tr>}
            {device?.timestampSource != null && <tr><td>Timestamp source</td><td>{String(device.timestampSource)}</td></tr>}
          </tbody>
        </table>
      </section>
      {crt.warnings.length > 0 && (
        <section className="card attn">
          {crt.warnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </section>
      )}
    </div>
  );
}
