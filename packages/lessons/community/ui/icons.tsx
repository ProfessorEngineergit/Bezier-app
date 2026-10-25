/** Line icons with a 1.5 px `currentColor` stroke, matching the editor. */

import type { ReactNode } from 'react';

function Icon({ size = 16, children }: { size?: 16 | 20; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5 * (16 / size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon>
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
  </Icon>
);

export const UploadIcon = () => (
  <Icon>
    <path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
);

/** The sidebar's Community entry: two people. */
export const CommunityIcon = () => (
  <Icon>
    <circle cx="6" cy="5.5" r="2.2" />
    <path d="M2 13c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8" />
    <circle cx="11.2" cy="6" r="1.7" />
    <path d="M11.5 9.4c1.5.2 2.6 1.4 2.6 3" />
  </Icon>
);

export const ServerIcon = () => (
  <Icon>
    <rect x="2.5" y="2.5" width="11" height="4.5" rx="1.5" />
    <rect x="2.5" y="9" width="11" height="4.5" rx="1.5" />
    <path d="M5 4.75h.01M5 11.25h.01" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const FlagIcon = () => (
  <Icon>
    <path d="M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8" />
  </Icon>
);

/** The sidebar's Wiki entry on stable: a page with lines. */
export const WikiIcon = () => (
  <Icon>
    <path d="M3.5 2.5h6.2l2.8 2.8v8.2h-9z" />
    <path d="M9.5 2.7v3h3M5.5 8h5M5.5 10.5h5" />
  </Icon>
);

/** A close cross, drawn because the × glyph sits low in its box. */
export function CrossIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
      style={{ display: 'block', margin: 'auto' }}
      viewBox="0 0 12 12"
      width="12"
    >
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
    </svg>
  );
}
