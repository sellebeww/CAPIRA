import type { CSSProperties } from 'react';

const paths = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  plus: 'M12 5v14M5 12h14',
  pulse: 'M2 12h5l3-8 4 16 3-8h5',
  history: 'M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7M12 7v5l3 2',
  play: 'm9 6 9 6-9 6ZM22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  flask: 'M9 3h6M10 3v7L4.5 19a1.3 1.3 0 0 0 1.1 2h12.8a1.3 1.3 0 0 0 1.1-2L14 10V3M7 15h10',
  annotate: 'm15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14ZM4 14l5 5',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  back: 'M19 12H5m5-5-5 5 5 5',
  clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check: 'm5 12 4 4L19 6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  camera: 'M4 6h4l2-3h4l2 3h4v15H4ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  file: 'M14 2H5v20h14V7ZM14 2v5h5M8 12h8M8 16h6',
  wifi: 'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01',
  chevron: 'm9 5 7 7-7 7',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
