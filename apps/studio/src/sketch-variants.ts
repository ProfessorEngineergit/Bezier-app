/** Maps the rail's sketch tool names to the sketch's own. */

import { CATEGORIES, type SketchTool } from '@bezier/ui';

/** Every sketch tool name, for narrowing a rail id. */
const SKETCH_TOOLS: readonly SketchTool[] = [
  'line',
  'arc',
  'circle',
  'rectangle',
  'center-rectangle',
  'trim',
  'extend',
  'split',
  'point',
  'polygon-3',
  'polygon-5',
  'polygon-6',
  'polygon-8',
  'slot',
  'circle-3p',
  'center-arc',
  'tangent-arc',
  'ellipse',
  'spline',
];

/**
 * Rail names that differ from the tool they select. A flyout variant needs its own name
 * (`diagonal-rectangle`) while the sketch keeps the original (`rectangle`); they are translated
 * here.
 */
const VARIANT_TOOL: Readonly<Record<string, SketchTool>> = {
  'diagonal-rectangle': 'rectangle',
  'three-point-arc': 'arc',
  'center-circle': 'circle',
  'trim-cut': 'trim',
  // Tools has its own Split, for bodies.
  'sketch-split': 'split',
};

export function variantAsTool(variant: string): SketchTool | null {
  const tool = VARIANT_TOOL[variant] ?? variant;
  // Narrowed, not asserted: a variant added to the catalogue but not the sketch should become "no
  // tool" rather than an unknown name.
  return SKETCH_TOOLS.includes(tool as SketchTool) ? (tool as SketchTool) : null;
}

export function toolAsVariant(tool: string | null): string | null {
  if (tool === null) return null;
  return Object.entries(VARIANT_TOOL).find(([, named]) => named === tool)?.[0] ?? tool;
}

const SKETCH_COMMANDS = CATEGORIES.sketch.commands;

/** The rail command a tool or variant belongs to (`center-arc` belongs to Arc). */
export function commandOf(id: string | null): string | null {
  if (id === null) return null;
  const variant = toolAsVariant(id) ?? id;
  return (
    SKETCH_COMMANDS.find(
      (command) => command.id === id || command.variants?.some((v) => v.id === variant),
    )?.id ?? null
  );
}

/** Whether a rail id draws something (a command with tools, or one of its variants). */
export function isDrawingCommand(id: string): boolean {
  // Sketch names only; the Tools Split is not the sketch's.
  const command = SKETCH_COMMANDS.find(
    (candidate) => candidate.id === id || candidate.variants?.some((v) => v.id === id),
  );
  if (command === undefined) return false;
  if (command.id === id && command.variants !== undefined)
    return command.variants.some((variant) => variantAsTool(variant.id) !== null);
  return variantAsTool(id) !== null;
}

/** The variant a command opens with when none is active: the one its label names. */
export function defaultVariant(commandId: string): string | null {
  const command = SKETCH_COMMANDS.find((candidate) => candidate.id === commandId);
  return command?.variants?.find((variant) => variant.label === command.variant)?.id ?? null;
}

/** For the rail: each command's active variant, by label. */
export function chosenVariants(active: string | null): Readonly<Record<string, string>> {
  const variant = toolAsVariant(active);
  const chosen: Record<string, string> = {};
  for (const command of SKETCH_COMMANDS) {
    const label = command.variants?.find((v) => v.id === variant)?.label;
    if (label !== undefined) chosen[command.id] = label;
  }
  return chosen;
}
