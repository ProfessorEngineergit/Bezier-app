/**
 * Rail contents as data, so the rail, command search and key handler share one declaration.
 * Only the direct-modelling flow is shown; future workspaces and tools are left out.
 */

import type { ReactNode } from 'react';
import {
  AlignIcon,
  ArcIcon,
  CenterlineIcon,
  ChamferIcon,
  CircleIcon,
  CombineIcon,
  CommandMark,
  ConstructIcon,
  DeleteIcon,
  ExitIcon,
  ExtrudeIcon,
  FilletIcon,
  HoleIcon,
  ImportIcon,
  ItemsIcon,
  JointIcon,
  LineIcon,
  LoftIcon,
  MeasureIcon,
  MirrorIcon,
  MoveRotateIcon,
  OffsetEdgeIcon,
  PatternIcon,
  PointIcon,
  PolygonIcon,
  ProjectIcon,
  QuickSettingsIcon,
  RectangleIcon,
  RevolveIcon,
  ScaleIcon,
  SectionIcon,
  ShellIcon,
  SketchIcon,
  SlotIcon,
  SplineIcon,
  SplitIcon,
  SweepIcon,
  TextIcon,
  ToolsIcon,
  TransformIcon,
  TrimIcon,
  WrapIcon,
} from '../icons/Icons.js';
import type { CategoryId } from './commands.js';
import { CATEGORIES } from './commands.js';
import { activeKeymap } from './keymap.js';
import type { RailGroup, RailItem } from './Rail.js';

/**
 * Commands with their own icon; the rest use `CommandMark`. Declared before the rails because
 * `LEFT_RAIL` builds its flyouts at module load.
 */
const COMMAND_ICONS: Record<string, ReactNode> = {
  line: <LineIcon />,
  arc: <ArcIcon />,
  rectangle: <RectangleIcon />,
  circle: <CircleIcon />,
  polygon: <PolygonIcon />,
  spline: <SplineIcon />,
  slot: <SlotIcon />,
  point: <PointIcon />,
  'sketch-text': <TextIcon />,
  trim: <TrimIcon />,
  'sketch-modify': <OffsetEdgeIcon />,
  'sketch-delete': <DeleteIcon />,
  // Keys must be existing command ids, or the lookup falls back to the generic mark.
  'move-rotate': <MoveRotateIcon />,
  scale: <ScaleIcon />,
  mirror: <MirrorIcon />,
  pattern: <PatternIcon />,
  align: <AlignIcon />,
  joint: <JointIcon />,
  loft: <LoftIcon />,
  sweep: <SweepIcon />,
  wrap: <WrapIcon />,
  project: <ProjectIcon />,
  'sketch-intersection': <SectionIcon />,
  'sketch-construction': <ConstructIcon />,
  centerline: <CenterlineIcon />,
  extrude: <ExtrudeIcon />,
  chamfer: <ChamferIcon />,
  hole: <HoleIcon />,
  fillet: <FilletIcon />,
  shell: <ShellIcon />,
  combine: <CombineIcon />,
  split: <SplitIcon />,
  revolve: <RevolveIcon />,
  // Import: opens a file into the document.
  file: <ImportIcon />,
  measure: <MeasureIcon />,
};

/**
 * Builds the left rail so its keycaps follow the active keymap. `LEFT_RAIL` is the default-keymap
 * snapshot.
 */
function buildLeftRail(): readonly RailGroup[] {
  return [
    {
      id: 'workspace',
      items: [{ id: 'items', label: 'Items', icon: <ItemsIcon /> }],
    },
    {
      id: 'categories',
      zone: 'centre',
      items: [
        // Sketch has no flyout: it is a mode, and `leftRailFor` swaps the rail for it.
        { id: 'sketch', label: 'Sketch', icon: <SketchIcon />, opensPalette: true },
        // Insert has a single command (File), so it sits directly in the rail.
        ...commandsOf('insert'),
        {
          id: 'transform',
          label: 'Transform',
          icon: <TransformIcon />,
          opensPalette: true,
          flyout: commandsOf('transform'),
        },
        {
          id: 'tools',
          label: 'Tools',
          icon: <ToolsIcon />,
          opensPalette: true,
          flyout: commandsOf('tools'),
        },
      ],
    },
    {
      id: 'inspect',
      zone: 'bottom',
      items: [
        { id: 'section', label: 'Section View', icon: <SectionIcon />, detail: 'Off' },
        { id: 'measure', label: 'Measure', icon: <MeasureIcon /> },
      ],
    },
  ];
}

export const LEFT_RAIL: readonly RailGroup[] = buildLeftRail();

/**
 * The right rail: a single quick-settings button at the bottom. Its panel (`ViewPanel`) shows the
 * view settings as tabs (View, Display, Units & Grid).
 */
/** Id of the quick-settings button. */
export const QUICK_SETTINGS = 'quick-settings';

export const RIGHT_RAIL: readonly RailGroup[] = [
  {
    id: 'view',
    zone: 'bottom',
    items: [{ id: QUICK_SETTINGS, label: 'Quick settings', icon: <QuickSettingsIcon /> }],
  },
];

/** The command's key in the active keymap. Combine uses Union's key. */
function shortcutOf(id: string, fallback: string | undefined): { shortcut?: string } {
  const key = activeKeymap().get(id === 'combine' ? 'union' : id) ?? fallback;
  return key === undefined ? {} : { shortcut: key };
}

/** A category's commands as rail items, shared by flyouts and sketch mode. */
function commandsOf(category: CategoryId): readonly RailItem[] {
  return CATEGORIES[category].commands.map((command) => {
    const variants = command.variants?.map((variant) => ({
      id: variant.id,
      label: variant.label,
      icon: COMMAND_ICONS[command.id] ?? <CommandMark />,
      ...(variant.needs === undefined ? {} : { disabled: true, disabledReason: variant.needs }),
    }));
    return {
      id: command.id,
      label: command.label,
      icon: COMMAND_ICONS[command.id] ?? <CommandMark />,
      ...shortcutOf(command.id, command.shortcut),
      ...(command.variant === undefined ? {} : { detail: command.variant }),
      ...(command.hasVariants === true ? { opensPalette: true } : {}),
      ...(variants === undefined ? {} : { flyout: variants }),
      ...(command.needs === undefined ? {} : { disabled: true, disabledReason: command.needs }),
    };
  });
}

/**
 * The left rail for the open category. Only Sketch changes it: as a mode, its commands replace the
 * category band, led by an exit row that shows the guard if any. Exit commits the sketch. Other
 * categories use flyouts and need nothing here.
 */
export function leftRailFor(
  category: CategoryId | null,
  guard?: string,
  sectionOn = false,
  /** Chosen variant label per command; defaults to the catalogue's. */
  chosen: Readonly<Record<string, string>> = {},
): readonly RailGroup[] {
  let base: readonly RailGroup[];

  if (category !== 'sketch') {
    base = buildLeftRail();
  } else {
    const commands: RailItem[] = [
      {
        id: 'exit',
        label: 'Finish Sketch',
        icon: <ExitIcon />,
        ...(guard === undefined ? {} : { detail: guard }),
      },
      ...commandsOf('sketch').map((command) => {
        const label = chosen[command.id] ?? command.detail;
        return command.flyout === undefined || label === undefined
          ? command
          : {
              ...command,
              detail: label,
              // Mark the variant the tool's key gives.
              flyout: command.flyout.map((variant) => ({
                ...variant,
                chosen: variant.label === label,
              })),
            };
      }),
    ];
    base = buildLeftRail().map((existing) =>
      existing.id === 'categories'
        ? { id: 'commands-open', zone: 'centre' as const, items: commands }
        : existing,
    );
  }

  if (!sectionOn) return base;
  return base.map((group) =>
    group.id !== 'inspect'
      ? group
      : {
          ...group,
          items: group.items.map((item) =>
            item.id !== 'section' ? item : { ...item, detail: 'On' },
          ),
        },
  );
}
