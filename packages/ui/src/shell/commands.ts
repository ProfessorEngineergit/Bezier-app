/**
 * The command catalogue, declared once and used by the rail, search, key handler and disabled-state
 * tooltips. Transform and Tools open as flyouts, Sketch as a mode (see `Rail.tsx`); a category with
 * a single command (Insert) shows it directly in the rail.
 * Only the active modelling flow is listed.
 */

import type { Shortcut } from './shortcut.js';

export type CategoryId = 'sketch' | 'insert' | 'construct' | 'transform' | 'tools';

export interface Command {
  id: string;
  label: string;
  shortcut?: Shortcut;
  /** Active variant, shown under the label: "Diagonal", "Fit", "Single". */
  variant?: string;
  /** The command has variants to choose from. */
  hasVariants?: boolean;
  /** Alternative gestures in the command's corner palette. */
  variants?: readonly CommandVariant[];
  /** Why the command is unavailable. Present: drawn disabled with this text as explanation. */
  needs?: string;
}

export interface CommandVariant {
  id: string;
  label: string;
  needs?: string;
}

export const CATEGORIES: Record<CategoryId, { label: string; commands: readonly Command[] }> = {
  sketch: {
    label: 'Sketch',
    commands: [
      { id: 'line', label: 'Line', shortcut: 'L' },
      { id: 'centerline', label: 'Centerline' },
      {
        id: 'arc',
        label: 'Arc',
        shortcut: 'A',
        variant: '3-point',
        hasVariants: true,
        variants: [
          { id: 'three-point-arc', label: '3-point' },
          { id: 'center-arc', label: 'Center' },
          { id: 'tangent-arc', label: 'Tangent' },
        ],
      },
      { id: 'spline', label: 'Spline' },
      {
        id: 'rectangle',
        label: 'Rectangle',
        shortcut: 'R',
        variant: 'Diagonal',
        hasVariants: true,
        variants: [
          { id: 'center-rectangle', label: 'Center' },
          { id: 'diagonal-rectangle', label: 'Diagonal' },
          // A rotated rectangle will be added once its geometry exists.
        ],
      },
      {
        id: 'circle',
        label: 'Circle',
        shortcut: 'C',
        variant: 'Center',
        hasVariants: true,
        variants: [
          { id: 'center-circle', label: 'Center' },
          { id: 'circle-3p', label: '3-point' },
          { id: 'ellipse', label: 'Ellipse' },
        ],
      },
      {
        id: 'polygon',
        label: 'Polygon',
        variant: 'Hexagon',
        hasVariants: true,
        variants: [
          { id: 'polygon-3', label: 'Triangle' },
          { id: 'polygon-5', label: 'Pentagon' },
          { id: 'polygon-6', label: 'Hexagon' },
          { id: 'polygon-8', label: 'Octagon' },
        ],
      },
      { id: 'slot', label: 'Slot' },
      { id: 'point', label: 'Point' },
      { id: 'sketch-text', label: 'Text' },
      {
        id: 'trim',
        label: 'Trim',
        shortcut: 'T',
        variant: 'Cut',
        hasVariants: true,
        variants: [
          { id: 'trim-cut', label: 'Cut' },
          { id: 'extend', label: 'Extend' },
          { id: 'sketch-split', label: 'Split' },
        ],
      },
      {
        // Acts on the sketch selection; values are set in the bar it opens.
        id: 'sketch-modify',
        label: 'Modify',
        variant: 'Offset',
        hasVariants: true,
        variants: [
          { id: 'sketch-offset', label: 'Offset' },
          { id: 'sketch-mirror', label: 'Mirror' },
          { id: 'sketch-pattern', label: 'Pattern' },
          { id: 'sketch-transform', label: 'Transform' },
        ],
      },
      { id: 'sketch-construction', label: 'Construction' },
      { id: 'project', label: 'Project' },
      // Intersection of the parts with the sketch plane, to draw against.
      { id: 'sketch-intersection', label: 'Intersection' },
      { id: 'sketch-delete', label: 'Delete' },
    ],
  },

  insert: {
    label: 'Insert',
    commands: [{ id: 'file', label: 'File', shortcut: 'Shift+Cmd+I' }],
  },

  construct: {
    label: 'Construct',
    commands: [
      // Construction geometry returns after the direct Sketch → Solid path is complete. The empty
      // category stays registered so saved UI state and callers need no migration.
    ],
  },

  transform: {
    label: 'Transform',
    commands: [
      // Enabled even though the gizmo cannot commit yet (it says so on use); disabling it would
      // hide the gizmo entirely.
      { id: 'move-rotate', label: 'Move/Rotate', shortcut: 'M' },
      // Only tools whose operation exists are listed.
      { id: 'scale', label: 'Scale', shortcut: 'S' },
      { id: 'mirror', label: 'Mirror' },
      { id: 'pattern', label: 'Pattern' },
      { id: 'align', label: 'Align' },
      { id: 'joint', label: 'Joint' },
    ],
  },

  tools: {
    label: 'Tools',
    commands: [
      // Combine covers the booleans; it needs documents with several bodies (ADR 0012).
      { id: 'fillet', label: 'Chamfer/Fillet', shortcut: 'F' },
      { id: 'extrude', label: 'Extrude', shortcut: 'E' },
      { id: 'shell', label: 'Shell', shortcut: 'H' },
      { id: 'hole', label: 'Hole' },
      { id: 'revolve', label: 'Revolve', shortcut: 'V' },
      { id: 'loft', label: 'Loft' },
      { id: 'sweep', label: 'Sweep' },
      { id: 'wrap', label: 'Wrap' },
      { id: 'combine', label: 'Combine', shortcut: 'Cmd+U' },
      { id: 'split', label: 'Split', shortcut: 'K' },
    ],
  },
};

/** All commands, flattened, for search. */
export function allCommands(): readonly (Command & { category: CategoryId })[] {
  return Object.entries(CATEGORIES).flatMap(([category, group]) =>
    group.commands.map((command) => ({ ...command, category: category as CategoryId })),
  );
}

/**
 * A command's enabled variants in declaration (flyout) order. Disabled variants are skipped so the
 * key cycle never stops on one.
 */
export function variantsOf(commandId: string): readonly string[] {
  const command = allCommands().find((candidate) => candidate.id === commandId);
  return (command?.variants ?? [])
    .filter((variant) => variant.needs === undefined)
    .map((variant) => variant.id);
}

/**
 * The next variant, wrapping. Null when the command has fewer than two enabled variants or none is
 * current; the caller then activates the declared default (e.g. Rectangle lists Center first but
 * defaults to Diagonal).
 */
export function nextVariant(commandId: string, current: string | null): string | null {
  if (current === null) return null;
  const cycle = variantsOf(commandId);
  if (cycle.length < 2) return null;
  const at = cycle.indexOf(current);
  if (at === -1) return null;
  return cycle[(at + 1) % cycle.length] ?? null;
}

/** How many of a category's commands are available. */
export function readyCount(category: CategoryId): { ready: number; total: number } {
  const commands = CATEGORIES[category].commands;
  return { ready: commands.filter((c) => c.needs === undefined).length, total: commands.length };
}
