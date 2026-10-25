/**
 * The three report kinds as line icons (a struck triangle, a notched line, a bulb), coloured by
 * their tile (`report.css`): grey at rest, the kind's colour when selected. The same drawings are
 * in `docs/brand/icons/report/`.
 */
import type { Kind } from './report-body.js';

const PATHS: Record<Kind, readonly string[]> = {
  problem: [
    'M12 4.2 21 19.5a1 1 0 0 1-.9 1.5H3.9a1 1 0 0 1-.9-1.5L12 4.2Z',
    'M12 10v4.2',
    'M12 17.2h.01',
  ],
  rough: ['M3.5 15.5h4.3l2.2-6 3.4 9 2.4-6.5 1.2 3.5h3.5'],
  idea: [
    'M9 17.5h6',
    'M10 20.5h4',
    'M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2v.7h5.2v-.7c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5Z',
  ],
};

export function KindMark({ kind }: { kind: Kind }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="22"
    >
      {PATHS[kind].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
