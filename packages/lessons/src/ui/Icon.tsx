/**
 * Icons in the brand style: round caps and joins, 1.9-unit strokes on a 16 grid (2.8 on this 24
 * grid), `currentColor`, shown at 16 or 20 px.
 */

import { LearnIcon } from './LearnIcon.js';

type Path = string | { d: string; fill: true };

const ICONS = {
  play: { d: 'M8 5.5v13l11-6.5z', fill: true },
  pause: 'M8 5.5v13M16 5.5v13',
  'skip-back': 'M7 6v12M18 6.5v11L9 12z',
  'skip-forward': 'M17 6v12M6 6.5v11L15 12z',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  'exit-fullscreen': 'M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5',
  import: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M4 19h16',
  export: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M4 19h16',
  record: { d: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z', fill: true },
  checkpoint: 'M6 21V4h11l-2 4 2 4H6',
  more: {
    d: 'M6 10.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm6 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm6 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z',
    fill: true,
  },
  close: 'M6 6l12 12M18 6 6 18',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.4-4.4',
  chapters: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  model: 'M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  follow: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8.5v7l5.5-3.5z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  microphone: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4',
  volume: 'M4 10v4h4l5 4V6l-5 4zM16.5 9a4.5 4.5 0 0 1 0 6',
  muted: 'M4 10v4h4l5 4V6l-5 4zM16 9.5l5 5M21 9.5l-5 5',
  trash: 'M5 7h14M9.5 7V4h5v3M7 7l1 13h8l1-13M10 11v5M14 11v5',
  check: 'M5 12.5l4.5 4.5L19 7',
  repeat: 'M4 12V9a3 3 0 0 1 3-3h11M15 3l3 3-3 3M20 12v3a3 3 0 0 1-3 3H6M9 21l-3-3 3-3',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
  shrink: 'M20 10h-6V4M4 14h6v6M14 10l7-7M3 21l7-7',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  edit: 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3',
  scissors:
    'M6 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM20 4 8.2 15.8M20 20 8.2 8.2',
  restore: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  flag: 'M5 21V4M5 4h13l-2.5 4L18 12H5',
  question:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14M12 17h.01',
  speed: 'M12 4a8 8 0 0 0-8 8v4h16v-4a8 8 0 0 0-8-8zM12 12l4-4',
  'zoom-in': 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.4-4.4M11 8v6M8 11h6',
  fit: 'M3 12h5M16 12h5M8 8l-4 4 4 4M16 8l4 4-4 4',
  split: 'M12 3v18M5 7l4 5-4 5M19 7l-4 5 4 5',
} satisfies Record<string, Path>;

export type IconName = keyof typeof ICONS | 'lesson';

export function Icon({ name, size = 16 }: { name: IconName; size?: 16 | 20 | 24 | 32 }) {
  if (name === 'lesson') return <LearnIcon size={size} />;
  const icon: Path = ICONS[name];
  const filled = typeof icon !== 'string';
  return (
    <svg
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      height={size}
      stroke={filled ? 'none' : 'currentColor'}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.6"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={filled ? icon.d : icon} />
    </svg>
  );
}
