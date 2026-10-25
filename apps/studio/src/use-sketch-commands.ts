/**
 * Sketch rail commands, outside `App.tsx`: drawing tools and their variants, and Modify. Pressing a
 * drawing command's key again cycles to its next variant; a variant picked from the flyout is used
 * as is.
 */

import type { PlaneBasis } from '@bezier/core';
import { mirrorSelection, nextVariant, type Point2D } from '@bezier/ui';
import { useState } from 'react';
import type { SketchAction } from './SketchActionBar.js';
import {
  chosenVariants,
  commandOf,
  defaultVariant,
  isDrawingCommand,
  toolAsVariant,
  variantAsTool,
} from './sketch-variants.js';
import type { SketchState } from './use-sketch.js';
import { useSketchClipboard } from './use-sketch-clipboard.js';

const ACTIONS: readonly string[] = [
  'sketch-offset',
  'sketch-pattern',
  'sketch-transform',
  'sketch-text',
];

export function useSketchCommands({
  sketch,
  basis,
  pickTool,
  sectionOutline,
  say,
}: {
  sketch: SketchState;
  /** The plane of the sketch being drawn, or null before one is chosen. */
  basis: PlaneBasis | null;
  pickTool: (id: string, next: string | null) => void;
  /** Where the parts intersect a plane, in its coordinates. */
  sectionOutline: (
    basis: PlaneBasis,
  ) => Promise<readonly (readonly { x: number; y: number }[])[] | null> | null;
  say: (message: string) => void;
}) {
  const hasSurface = basis !== null;
  const [action, setAction] = useState<SketchAction | null>(null);
  useSketchClipboard(sketch, hasSurface);
  // Text placement: a click in the sketch while Text is open sets it, as in other CAD tools.
  const [textAt, setTextAt] = useState<Point2D | null>(null);

  /** Runs a sketch rail command; false when the id is not one. */
  const run = (id: string): boolean => {
    if (id === 'centerline') {
      setAction(null);
      pickTool('line', 'line');
      sketch.setDrawingConstruction(true);
      return true;
    }
    if (id === 'sketch-intersection') {
      if (basis === null) {
        say('Choose a plane to sketch on first.');
        return true;
      }
      void sectionOutline(basis)?.then((outline) => {
        if (outline === null) say('The parts could not be cut by this plane.');
        else if (outline.length === 0) say('No part reaches this plane.');
        else sketch.project(outline);
      });
      return true;
    }
    if (id === 'sketch-text') {
      if (sketch.tool !== null) sketch.setTool(null);
      setAction('sketch-text');
      return true;
    }
    if (id === 'sketch-modify' || ACTIONS.includes(id) || id === 'sketch-mirror') {
      const chosen = id === 'sketch-modify' ? (action ?? defaultVariant(id)) : id;
      if (chosen === 'sketch-mirror') {
        setAction(null);
        sketch.applyEdit(mirrorSelection(sketch.draft, sketch.selected));
        return true;
      }
      // Modify acts on the picks, so the active tool is dropped and the picks kept.
      if (sketch.tool !== null) sketch.setTool(null);
      setAction(chosen as SketchAction);
      return true;
    }
    if (!isDrawingCommand(id)) return false;
    setAction(null);
    if (!hasSurface) {
      // Without a plane, queue the tool under the name it will use.
      const first = defaultVariant(id) ?? id;
      pickTool(first, first);
      return true;
    }
    const owner = commandOf(id);
    if (owner === id && defaultVariant(id) !== null) {
      const cycled = nextVariant(id, toolAsVariant(sketch.tool));
      pickTool(id, cycled ?? defaultVariant(id));
      return true;
    }
    // A plain tool pressed again is dropped; a variant from the flyout is selected.
    const next = variantAsTool(id);
    pickTool(id, owner === id && sketch.tool === next ? null : id);
    return true;
  };

  const shown = sketch.tool ?? action;
  return {
    run,
    action,
    textAt,
    /** A click on the sketch plane: text placement while Text is open, otherwise drawing. */
    click: (at: Point2D, additive?: boolean, hitRadius?: number) => {
      if (action === 'sketch-text') setTextAt(at);
      else sketch.click(at, additive, hitRadius);
    },
    closeAction: () => setAction(null),
    /** The highlighted rail command: the active tool's, or Modify's while its bar is open. */
    activeCommand:
      sketch.tool !== null
        ? commandOf(sketch.tool)
        : action === null
          ? null
          : action === 'sketch-text'
            ? 'sketch-text'
            : 'sketch-modify',
    chosen: chosenVariants(shown),
  };
}
