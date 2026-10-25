const shape = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.1,
  strokeLinejoin: 'round',
} as const;
export function BodyItemIcon() {
  return (
    <svg aria-hidden="true" {...shape}>
      <path d="m8 1.8 5.5 3.1v6.2L8 14.2l-5.5-3.1V4.9zM2.5 4.9 8 8l5.5-3.1M8 8v6.2" />
    </svg>
  );
}
export function SketchItemIcon() {
  return (
    <svg aria-hidden="true" {...shape}>
      <path d="M10 2H2v12h12V6M6 8l6-6 2 2-6 6-3 1z" />
    </svg>
  );
}
export function PictureItemIcon() {
  return (
    <svg aria-hidden="true" {...shape}>
      <path d="M2 3h12v10H2zM2 11l3.4-3.4 2.6 2.6 2-2 4 4M10.6 6.2a.9.9 0 1 0 0-.01" />
    </svg>
  );
}
