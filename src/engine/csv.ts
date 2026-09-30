import type { CaptureInput, FrameSample, Protocol } from './types';

/**
 * Recording CSV format (derived per-frame signal, NOT video).
 * Baris pertama: `# capira-v1 {json meta}`. Used by the Experiment page (export) and `npm run analyze` (import).
 */
export interface CaptureMeta {
  pressCue: number;
  releaseCue: number;
  protocol: Protocol;
  roiSizePx?: number;
  /** Free-form: subject label, device, camera capabilities, notes. Do not include patient identity. */
  [key: string]: unknown;
}

const COLS = ['t', 'roi_r', 'roi_g', 'roi_b', 'ref_r', 'ref_g', 'ref_b', 'luma', 'clip_frac', 'sharpness', 'dx', 'dy', 'dropped'] as const;

const fmt = (v: number | undefined | null) => (v === undefined || v === null || Number.isNaN(v) ? '' : String(+v.toPrecision(8)));

export function toCsv(input: CaptureInput, extraMeta: Record<string, unknown> = {}): string {
  const meta: CaptureMeta = {
    pressCue: input.markers.pressCue,
    releaseCue: input.markers.releaseCue,
    protocol: input.protocol,
    roiSizePx: input.roiSizePx,
    ...extraMeta,
  };
  const lines = [`# capira-v1 ${JSON.stringify(meta)}`, COLS.join(',')];
  for (const f of input.frames) {
    lines.push(
      [f.t, f.roi.r, f.roi.g, f.roi.b, f.ref?.r, f.ref?.g, f.ref?.b, f.luma, f.clipFrac, f.sharpness, f.dx, f.dy, f.dropped]
        .map(fmt)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export function fromCsv(text: string): { input: CaptureInput; meta: CaptureMeta } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const metaLine = lines.find((l) => l.startsWith('# capira-v1 '));
  if (!metaLine) throw new Error('Not a CAPIRA CSV file (the "# capira-v1" meta line is missing).');
  const meta = JSON.parse(metaLine.slice('# capira-v1 '.length)) as CaptureMeta;
  if (!meta || !['A', 'B', 'C'].includes(meta.protocol) || !Number.isFinite(meta.pressCue) || !Number.isFinite(meta.releaseCue) || meta.releaseCue <= meta.pressCue) {
    throw new Error('Invalid CSV metadata: check the protocol and time markers.');
  }
  const headerIdx = lines.findIndex((l) => l.startsWith('t,'));
  if (headerIdx < 0) throw new Error('CSV header not found.');
  const header = lines[headerIdx].split(',');
  if (['t', 'roi_r', 'roi_g', 'roi_b'].some((column) => !header.includes(column))) throw new Error('The time or ROI color columns are incomplete.');
  const idx = (c: string) => header.indexOf(c);
  const num = (cells: string[], c: string) => {
    const i = idx(c);
    if (i < 0 || cells[i] === undefined || cells[i] === '') return undefined;
    const value = Number(cells[i]);
    if (!Number.isFinite(value)) throw new Error(`Invalid CSV value in column ${c}.`);
    return value;
  };
  const frames: FrameSample[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (line.startsWith('#')) continue;
    const c = line.split(',');
    if (['t', 'roi_r', 'roi_g', 'roi_b'].some((column) => num(c, column) === undefined)) throw new Error('The time or ROI color data is empty.');
    const refR = num(c, 'ref_r');
    const reference = ['ref_r', 'ref_g', 'ref_b'].map((column) => num(c, column));
    if (reference.some((v) => v !== undefined) && reference.some((v) => v === undefined)) throw new Error('The reference color data is incomplete.');
    frames.push({
      t: num(c, 't')!,
      roi: { r: num(c, 'roi_r')!, g: num(c, 'roi_g')!, b: num(c, 'roi_b')! },
      ref: refR === undefined ? null : { r: refR, g: num(c, 'ref_g')!, b: num(c, 'ref_b')! },
      luma: num(c, 'luma') ?? 0,
      clipFrac: num(c, 'clip_frac') ?? 0,
      sharpness: num(c, 'sharpness'),
      dx: num(c, 'dx'),
      dy: num(c, 'dy'),
      dropped: num(c, 'dropped'),
    });
  }
  if (!frames.length) throw new Error('The CSV contains no recorded frames.');
  return {
    input: {
      frames,
      markers: { pressCue: meta.pressCue, releaseCue: meta.releaseCue },
      protocol: meta.protocol,
      roiSizePx: meta.roiSizePx,
    },
    meta,
  };
}
