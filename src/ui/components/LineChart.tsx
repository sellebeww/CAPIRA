export interface Series {
  x: number[];
  y: (number | null)[];
  color: string;
  width?: number;
  dash?: string;
  label?: string;
  step?: boolean;
  opacity?: number;
}

export interface VLine {
  x: number;
  label?: string;
  color: string;
  dash?: string;
}

export interface Band {
  x0: number;
  x1: number;
  color: string;
  label?: string;
}

interface Props {
  series: Series[];
  xDomain: [number, number];
  yDomain: [number, number];
  vlines?: VLine[];
  hlines?: { y: number; label?: string; color: string; dash?: string }[];
  bands?: Band[];
  xLabel?: string;
  yTicks?: number[];
  height?: number;
  ariaLabel: string;
}

const W = 640;

/** Lightweight SVG chart with no library (bundled, offline). */
export function LineChart({ series, xDomain, yDomain, vlines = [], hlines = [], bands = [], xLabel, yTicks, height = 240, ariaLabel }: Props) {
  const m = { l: 40, r: 12, t: 16, b: 30 };
  const H = height;
  const sx = (x: number) => m.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * (W - m.l - m.r);
  const sy = (y: number) => H - m.b - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * (H - m.t - m.b);
  const clampY = (y: number) => Math.max(yDomain[0] - 0.05 * (yDomain[1] - yDomain[0]), Math.min(yDomain[1] + 0.05 * (yDomain[1] - yDomain[0]), y));

  const path = (s: Series) => {
    let d = '';
    let pen = false;
    let prevY: number | null = null;
    for (let i = 0; i < s.x.length; i++) {
      const y = s.y[i];
      const x = s.x[i];
      if (y === null || x < xDomain[0] || x > xDomain[1]) {
        pen = false;
        prevY = null;
        continue;
      }
      const px = sx(x).toFixed(1);
      const py = sy(clampY(y)).toFixed(1);
      if (!pen) d += `M${px},${py}`;
      else if (s.step && prevY !== null) d += `L${px},${sy(clampY(prevY)).toFixed(1)}L${px},${py}`;
      else d += `L${px},${py}`;
      pen = true;
      prevY = y;
    }
    return d;
  };

  const xTicks: number[] = [];
  const span = xDomain[1] - xDomain[0];
  const stepX = span > 16 ? 4 : span > 8 ? 2 : 1;
  for (let x = Math.ceil(xDomain[0] / stepX) * stepX; x <= xDomain[1] + 1e-9; x += stepX) xTicks.push(x);
  const ys = yTicks ?? [yDomain[0], (yDomain[0] + yDomain[1]) / 2, yDomain[1]];

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {bands.map((b, i) => (
        <g key={`b${i}`}>
          <rect x={sx(b.x0)} y={m.t} width={Math.max(0, sx(b.x1) - sx(b.x0))} height={H - m.t - m.b} fill={b.color} />
          {b.label && (
            <text x={(sx(b.x0) + sx(b.x1)) / 2} y={m.t + 12} textAnchor="middle">
              {b.label}
            </text>
          )}
        </g>
      ))}
      <line className="axis" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
      <line className="axis" x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} />
      {xTicks.map((x) => (
        <text key={`x${x}`} x={sx(x)} y={H - m.b + 16} textAnchor="middle">
          {Number.isInteger(x) ? x : x.toFixed(1)}
        </text>
      ))}
      {ys.map((y) => (
        <g key={`y${y}`}>
          <line x1={m.l} x2={W - m.r} y1={sy(y)} y2={sy(y)} stroke="currentColor" strokeOpacity={0.08} />
          <text x={m.l - 6} y={sy(y) + 4} textAnchor="end">
            {Math.abs(y) < 10 ? y.toFixed(1) : y.toFixed(0)}
          </text>
        </g>
      ))}
      {xLabel && (
        <text x={W - m.r} y={H - 2} textAnchor="end">
          {xLabel}
        </text>
      )}
      {hlines.map((h, i) => (
        <g key={`h${i}`}>
          <line x1={m.l} x2={W - m.r} y1={sy(h.y)} y2={sy(h.y)} stroke={h.color} strokeDasharray={h.dash ?? '4 4'} strokeWidth={1.2} />
          {h.label && (
            <text x={m.l + 4} y={sy(h.y) - 4} style={{ fill: h.color }}>
              {h.label}
            </text>
          )}
        </g>
      ))}
      {series.map((s, i) => (
        <path key={`s${i}`} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeOpacity={s.opacity ?? 1} strokeLinejoin="round" />
      ))}
      {vlines.map((v, i) => (
        <g key={`v${i}`}>
          <line x1={sx(v.x)} x2={sx(v.x)} y1={m.t} y2={H - m.b} stroke={v.color} strokeDasharray={v.dash} strokeWidth={1.6} />
          {v.label && (
            <text x={sx(v.x) + 3} y={m.t + 10 + (i % 3) * 12} style={{ fill: v.color, fontWeight: 700 }}>
              {v.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
