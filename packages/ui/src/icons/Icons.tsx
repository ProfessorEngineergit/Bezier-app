/**
 * App icons. Most are brand icons ({@link BrandIcon}, from `docs/brand/icons`, built into
 * `brand-icons.generated.ts` by `scripts/build-app-icons.mjs`). Icons the brand set lacks are drawn
 * here with {@link Glyph} in a heavier filled style until they are redrawn. All use the 16-unit
 * grid and `currentColor`; selection and hover are drawn behind the button, never on the glyph.
 */

import type { ReactNode } from 'react';
import { BRAND_ICONS, type BrandIconKey } from './brand-icons.generated.js';

/** Stroke width for primary geometry (lines, arcs, edges). */
const STROKE = 1.9;

/** Opacity for non-real geometry: construction lines, ghosts, offcuts. */
export const GHOST = 0.42;

/** Opacity for surfaces, kept below their edges. */
export const FILL = 0.26;

/** The shared 16-unit SVG frame. Exported so sibling icon sets match it. */
export function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={STROKE}
      viewBox="0 0 16 16"
      width="20"
    >
      {children}
    </svg>
  );
}

/** A brand icon (`docs/brand/icons`, built by `scripts/build-app-icons.mjs`) as an `<svg>`. */
export function BrandIcon({ name }: { name: BrandIconKey }) {
  return BRAND_ICONS[name]();
}

const brand = (name: BrandIconKey) => () => <BrandIcon name={name} />;

export const ArcIcon = brand('arc');
export const CircleIcon = brand('circle');
export const CombineIcon = brand('combine');
export const ConstructIcon = brand('centerline');
export const DeleteIcon = brand('erase');
export const DisplayIcon = brand('display');
export const DrawingsIcon = brand('drawings');
export const EllipseIcon = brand('ellipse');
export const ExitIcon = brand('exit');
export const ExportIcon = brand('export');
export const EyeIcon = brand('eye');
export const EyeOffIcon = brand('eye-off');
export const FilletIcon = brand('fillet');
export const FinishIcon = brand('finish');
export const GearIcon = brand('settings');
export const HistoryIcon = brand('history');
export const HomeIcon = brand('home');
export const ImportIcon = brand('import');
export const ItemsIcon = brand('items');
export const LineIcon = brand('line');
export const MeasureIcon = brand('measure');
export const MirrorIcon = brand('mirror');
export const ModelingIcon = brand('design');
export const MoreIcon = brand('more');
export const MoveRotateIcon = brand('move');
export const OffsetEdgeIcon = brand('offset');
export const PatternIcon = brand('pattern');
export const PolygonIcon = brand('polygon');
export const ProjectIcon = brand('project');
export const QuickSettingsIcon = brand('settings');
export const RectangleIcon = brand('rectangle');
export const RevolveIcon = brand('revolve');
export const ScaleIcon = brand('scale');
export const ScreenshotIcon = brand('screenshot');
export const SearchIcon = brand('search');
export const SectionIcon = brand('section');
export const ShellIcon = brand('shell');
export const SketchIcon = brand('sketch');
export const SnapIcon = brand('snap');
export const SplineIcon = brand('spline');
export const SplitIcon = brand('split');
export const TextIcon = brand('text');
export const ToolsIcon = brand('tools');
export const TransformIcon = brand('transform');
export const TrimIcon = brand('trim');
export const UnitsIcon = brand('units');
export const ViewsIcon = brand('view');
export const VisualizationIcon = brand('visualize');
export const ChamferIcon = brand('chamfer');
export const HoleIcon = brand('hole');
export const CenterlineIcon = brand('centerline');
export const ExtrudeIcon = brand('extrude');

/**
 * Close/remove cross. Drawn rather than the typed ×, whose vertical position varies by font and
 * size; centred in its button.
 */
export function CrossIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="cross-icon"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
      viewBox="0 0 12 12"
      width={size}
    >
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
    </svg>
  );
}

/** An origin or centre, drawn solid to differ from a handle. */
function Origin({ x, y, r = 1.4 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} fill="currentColor" r={r} stroke="none" />;
}

/* Workspaces. */

/** A solid on a build plate: the 3D-print workspace. */
export const PrintIcon = () => (
  <Glyph>
    <path d="M1.4 11 8 14.6 14.6 11 8 7.4Z" fill="currentColor" opacity={FILL} stroke="none" />
    <path d="M1.4 11 8 14.6 14.6 11 8 7.4Z" />
    <path d="M5.6 6.2 8 4.9l2.4 1.3v3L8 10.5l-2.4-1.3Z" fill="currentColor" stroke="none" />
  </Glyph>
);

/* Rail, left. */

/** Placeholder for commands without their own icon yet. */
export const CommandMark = () => (
  <Glyph>
    <circle cx="8" cy="8" opacity={GHOST} r="2.8" strokeWidth="1.6" />
  </Glyph>
);

/* Sketch tools. */

/** A slot. */
export const SlotIcon = () => (
  <Glyph>
    <rect
      fill="currentColor"
      height="6.4"
      opacity={FILL}
      rx="3.2"
      stroke="none"
      width="12"
      x="2"
      y="4.8"
    />
    <rect height="6.4" rx="3.2" width="12" x="2" y="4.8" />
    <Origin x={5.2} y={8} />
    <Origin x={10.8} y={8} />
  </Glyph>
);

/** A point with its placement cross. */
export const PointIcon = () => (
  <Glyph>
    <path d="M8 3.2v2.4M8 10.4v2.4M3.2 8h2.4M10.4 8h2.4" opacity={GHOST} />
    <Origin r={1.9} x={8} y={8} />
  </Glyph>
);

/** A square section running into a smaller round one. */
export const LoftIcon = () => (
  <Glyph>
    <path d="M2.5 13.5h6v-3h-6Z" fill="currentColor" stroke="none" />
    <ellipse cx="11" cy="3.6" opacity={GHOST} rx="2.6" ry="1.4" strokeWidth="1.4" />
    <path d="M2.5 10.5 8.4 3.6M8.5 10.5l5.1-6.9" strokeWidth="1.4" />
  </Glyph>
);

/** A round section carried along a bent path. */
export const SweepIcon = () => (
  <Glyph>
    <path
      d="M2.6 13.4V7.2a4 4 0 0 1 4-4h6.8"
      opacity={GHOST}
      strokeDasharray="1.6 1.3"
      strokeWidth="1.4"
    />
    <circle cx="2.6" cy="12.4" fill="currentColor" r="1.9" stroke="none" />
    <path d="M5.6 13.4V8a2.6 2.6 0 0 1 2.6-2.6h5.2" strokeWidth="1.6" />
  </Glyph>
);

/** Two links on a pin. */
export const JointIcon = () => (
  <Glyph>
    <path d="M2 11.5 8 5.5" strokeWidth="3" strokeLinecap="round" />
    <path d="M8 5.5 13.6 9" opacity={GHOST} strokeWidth="3" strokeLinecap="round" />
    <circle cx="8" cy="5.5" fill="currentColor" r="1.8" stroke="none" />
  </Glyph>
);

/** Letters laid round a cylinder. */
export const WrapIcon = () => (
  <Glyph>
    <ellipse cx="8" cy="3.4" opacity={GHOST} rx="5.2" ry="1.8" strokeWidth="1.4" />
    <path d="M2.8 3.4v9.2c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8V3.4" strokeWidth="1.4" />
    <path d="M5 7.2l1.4 4 1.6-3 1.6 3 1.4-4" strokeWidth="1.5" />
  </Glyph>
);

/** A block turned and set flat against another. */
export const AlignIcon = () => (
  <Glyph>
    <path d="M9.6 3.2h4.6v9.6H9.6Z" fill="currentColor" stroke="none" />
    <path d="M4.2 5.6h5.4v4.8H4.2Z" strokeWidth="1.6" />
    <path d="M2.2 1.8 4 4.4" opacity={GHOST} strokeWidth="1.4" />
    <path d="M1.8 14.2h4.4" opacity={GHOST} strokeDasharray="1.4 1.2" strokeWidth="1.4" />
  </Glyph>
);

/**
 * A project: a block on a plate, used on the start page. (`ProjectIcon` is the Project sketch
 * tool.)
 */
export const PartIcon = () => (
  <Glyph>
    <path d="M2 10.4 8 7.6l6 2.8-6 2.8Z" fill="currentColor" opacity={FILL} stroke="none" />
    <path d="M2 10.4 8 7.6l6 2.8-6 2.8ZM2 10.4v1.6l6 2.8 6-2.8v-1.6" />
    <path d="M5.2 6.2 8 4.9l2.8 1.3v2.6L8 10.1 5.2 8.8Z" fill="currentColor" stroke="none" />
    <path d="M5.2 4.5 8 3.2l2.8 1.3L8 5.8Z" opacity={GHOST} strokeWidth="1.2" />
  </Glyph>
);

/* Panel controls. */

/** A folder with a plus, for grouping. Large corner radius, after the reference design. */
export const FolderPlusIcon = () => (
  <Glyph>
    <path
      d="M2.3 5.4a2 2 0 0 1 2-2h1.9c.5 0 1 .2 1.4.6l.7.7h3.4a2 2 0 0 1 2 2v5.1a2 2 0 0 1-2 2h-7.4a2 2 0 0 1-2-2Z"
      fill="currentColor"
      opacity={FILL}
      stroke="none"
    />
    <path d="M2.3 5.4a2 2 0 0 1 2-2h1.9c.5 0 1 .2 1.4.6l.7.7h3.4a2 2 0 0 1 2 2v5.1a2 2 0 0 1-2 2h-7.4a2 2 0 0 1-2-2Z" />
    <path d="M8 7.3v3.6M6.2 9.1h3.6" strokeWidth="1.7" />
  </Glyph>
);

/** A folder. `open` is accepted but not rendered by the brand icon. */
export const FolderIcon = (_: { open?: boolean }) => <BrandIcon name="folder" />;

/** A mouse, for the scrolling-device setting. */
export const MouseIcon = () => (
  <Glyph>
    <rect
      fill="currentColor"
      height="11.4"
      opacity={FILL}
      rx="3.2"
      stroke="none"
      width="6.8"
      x="4.6"
      y="2.3"
    />
    <rect height="11.4" rx="3.2" width="6.8" x="4.6" y="2.3" />
    <path d="M8 4.4v1.9" />
  </Glyph>
);

/** A trackpad with two fingers, for the scrolling-device setting. */
export const TrackpadIcon = () => (
  <Glyph>
    <rect
      fill="currentColor"
      height="9.4"
      opacity={FILL}
      rx="1.8"
      stroke="none"
      width="11.4"
      x="2.3"
      y="3.3"
    />
    <rect height="9.4" rx="1.8" width="11.4" x="2.3" y="3.3" />
    <Origin r={1.15} x={6.4} y={8} />
    <Origin r={1.15} x={9.6} y={8} />
  </Glyph>
);
