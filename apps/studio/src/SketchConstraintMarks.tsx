/**
 * A small mark beside each constrained element of the active sketch (H on a horizontal line, ∥ on a
 * parallel pair); clicking a mark removes the constraint. Lengths and radii are shown by their
 * dimension labels instead (`SketchDimensions`).
 *
 * Positioned every frame by writing styles, never through React state (ADR 0007).
 */

import { planeToWorld, type SketchSurface, surfaceBasis } from '@bezier/core';
import type { Sketch, SketchConstraint, SketchId } from '@bezier/solver';
import { CONSTRAINT_TOOLS, CrossIcon, describeConstraint, shownDegrees } from '@bezier/ui';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { px, setStyle } from './dom-writes.js';

interface ProjectionHandle {
  project(x: number, y: number, z: number): { x: number; y: number } | null;
}

interface Mark {
  id: SketchId;
  glyph: string;
  title: string;
  at: { x: number; y: number; z: number };
  /** How many marks already sit on this element; this one is offset by that many. */
  stack: number;
  /** A value the mark shows and edits: an angle in degrees, or a length ratio. */
  edit?: { value: number; unit: '°' | '×'; noun: 'angle' | 'ratio' };
}

export function SketchConstraintMarks({
  plane,
  sketch,
  handleRef,
  onRemove,
  onAngleChange,
  onRatioChange,
  flags,
}: {
  plane: SketchSurface;
  sketch: Sketch;
  handleRef: RefObject<ProjectionHandle | null>;
  onRemove: (id: SketchId) => void;
  onAngleChange?: (id: SketchId, degrees: number) => void;
  onRatioChange?: (id: SketchId, ratio: number) => void;
  /** Marks to show as conflicting or redundant. */
  flags?: ReadonlyMap<SketchId, 'conflict' | 'redundant'>;
}) {
  const marks = useMemo(() => marksOf(plane, sketch, flags), [plane, sketch, flags]);
  const nodes = useRef(new Map<SketchId, HTMLElement>());
  const [editing, setEditing] = useState<SketchId | null>(null);
  const bind = (id: SketchId) => (node: HTMLElement | null) => {
    if (node === null) nodes.current.delete(id);
    else nodes.current.set(id, node);
  };

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const handle = handleRef.current;
      if (handle === null) return;
      for (const mark of marks) {
        const node = nodes.current.get(mark.id);
        if (node === undefined) continue;
        const screen = handle.project(mark.at.x, mark.at.y, mark.at.z);
        if (screen === null) {
          setStyle(node, 'visibility', 'hidden');
          continue;
        }
        setStyle(node, 'visibility', 'visible');
        // Offset in pixels, not millimetres, so marks stay beside the line at every zoom. Above the
        // line, since its length label hangs below.
        const dx = screen.x + mark.stack * 20;
        const dy = screen.y - 18;
        setStyle(node, 'transform', `translate(${px(dx)}, ${px(dy)}) translate(-50%, -50%)`);
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [marks, handleRef]);

  return (
    <div className="constraint-marks">
      {marks.map((mark) => {
        const edit = mark.edit;
        const change =
          edit?.noun === 'angle'
            ? onAngleChange
            : edit?.noun === 'ratio'
              ? onRatioChange
              : undefined;
        return edit !== undefined && change !== undefined ? (
          <span
            className="constraint-mark constraint-mark--angle"
            data-state={flags?.get(mark.id)}
            key={mark.id}
            ref={bind(mark.id)}
          >
            {editing === mark.id ? (
              <input
                aria-label={edit.noun === 'angle' ? 'Angle in degrees' : 'Length ratio'}
                // biome-ignore lint/a11y/noAutofocus: the field opens because it was just clicked.
                autoFocus
                defaultValue={round(edit.value)}
                inputMode="decimal"
                onBlur={() => setEditing(null)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Escape') {
                    // Otherwise the desktop window leaves full screen on the same press.
                    event.preventDefault();
                    setEditing(null);
                  }
                  if (event.key !== 'Enter') return;
                  const value = Number(event.currentTarget.value.replace(',', '.'));
                  if (value > 0 && (edit.noun === 'ratio' || value < 180)) change(mark.id, value);
                  setEditing(null);
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            ) : (
              <button
                aria-label={`Change ${uncapitalise(mark.title)}`}
                onClick={() => setEditing(mark.id)}
                onPointerDown={(event) => event.stopPropagation()}
                title={`${mark.title}. Click to change.`}
                type="button"
              >
                {edit.noun === 'angle' ? `∠ ${round(edit.value)}°` : `${round(edit.value)}×`}
              </button>
            )}
            <button
              aria-label={`Remove ${uncapitalise(mark.title)}`}
              className="constraint-mark__remove"
              onClick={() => onRemove(mark.id)}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              <CrossIcon />
            </button>
          </span>
        ) : (
          <button
            aria-label={`Remove ${mark.title}`}
            className="constraint-mark"
            data-state={flags?.get(mark.id)}
            key={mark.id}
            onClick={() => onRemove(mark.id)}
            onPointerDown={(event) => event.stopPropagation()}
            ref={bind(mark.id)}
            title={`${mark.title}. Click to remove.`}
            type="button"
          >
            {mark.glyph}
          </button>
        );
      })}
    </div>
  );
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function marksOf(
  plane: SketchSurface,
  sketch: Sketch,
  flags: ReadonlyMap<SketchId, 'conflict' | 'redundant'> | undefined,
): readonly Mark[] {
  const basis = surfaceBasis(plane);
  if (basis === null) return [];
  const marks: Mark[] = [];
  const stacked = new Map<string, number>();
  const quiet = polygonRelations(sketch);
  for (const constraint of sketch.constraints) {
    // A polygon's corners-on-circle and equal-side constraints define it, like a rectangle's H and
    // V; marking them would cover the shape.
    const flagged = flags?.has(constraint.id) === true;
    if (quiet.has(constraint.id) && !flagged) continue;
    // A hidden constraint (a rectangle's H, an anchor, a size) is shown while flagged as
    // conflicting or redundant, so the colour marks something.
    const glyph = glyphOf(constraint) ?? (flagged ? plainGlyph(constraint) : null);
    const anchor = anchorOf(sketch, constraint);
    if (glyph === null || anchor === null) continue;
    // Several marks on one element are offset from each other instead of stacking.
    const key = `${Math.round(anchor.x * 100)}:${Math.round(anchor.y * 100)}`;
    const degrees = constraint.kind === 'angle' ? shownDegrees(sketch, constraint) : null;
    const edit =
      degrees !== null
        ? { value: degrees, unit: '°' as const, noun: 'angle' as const }
        : constraint.kind === 'lengthRatio'
          ? { value: constraint.ratio, unit: '×' as const, noun: 'ratio' as const }
          : null;
    const count = stacked.get(key) ?? 0;
    stacked.set(key, count + 1);
    marks.push({
      id: constraint.id,
      glyph,
      title: capitalise(describeConstraint(sketch, constraint.id)),
      at: planeToWorld(basis, anchor.x, anchor.y),
      stack: count,
      ...(edit !== null ? { edit } : {}),
    });
  }
  return marks;
}

/**
 * The constraint ids that define a regular polygon: corners on a construction circle that end sides
 * between such corners, and the equal sides between them. A point placed on a construction circle
 * by hand (a bolt circle hole) keeps its mark.
 */
function polygonRelations(sketch: Sketch): ReadonlySet<SketchId> {
  const circles = new Set(
    sketch.primitives.flatMap((p) =>
      p.kind === 'circle' && p.construction === true ? [p.id] : [],
    ),
  );
  const on = sketch.constraints.filter(
    (c): c is Extract<SketchConstraint, { kind: 'pointOn' }> =>
      c.kind === 'pointOn' && circles.has(c.on),
  );
  const onCircle = new Set(on.map((c) => c.point));
  const sides = sketch.primitives.flatMap((p) =>
    p.kind === 'line' && onCircle.has(p.start) && onCircle.has(p.end) ? [p] : [],
  );
  const corners = new Set(sides.flatMap((line) => [line.start, line.end]));
  const sideIds = new Set(sides.map((line) => line.id));
  const quiet = new Set<SketchId>(on.filter((c) => corners.has(c.point)).map((c) => c.id));
  for (const c of sketch.constraints)
    if (c.kind === 'equal' && sideIds.has(c.a) && sideIds.has(c.b)) quiet.add(c.id);
  return quiet;
}

function plainGlyph(constraint: SketchConstraint): string {
  if (constraint.kind === 'lock') return '⚓';
  if (constraint.kind === 'radius') return 'R';
  if (constraint.kind === 'diameter') return '⌀';
  return CONSTRAINT_TOOLS.find((tool) => tool.id === constraint.kind)?.mark ?? '↔';
}

function glyphOf(constraint: SketchConstraint): string | null {
  // A dimension is its own label (`SketchDimensions`), so it has no mark.
  if (
    constraint.kind === 'distance' ||
    constraint.kind === 'radius' ||
    constraint.kind === 'diameter' ||
    constraint.kind === 'horizontalDistance' ||
    constraint.kind === 'verticalDistance' ||
    constraint.kind === 'pointLineDistance'
  )
    return null;
  // Kept but not drawn: a rectangle carries an H and a V on every side, and an anchor on whatever
  // was fixed, which is clutter rather than information. The constraint still holds, and Undo
  // removes it.
  if (constraint.kind === 'horizontal' || constraint.kind === 'vertical') return null;
  if (constraint.kind === 'lock') return null;
  if (constraint.kind === 'angle') return '∠';
  if (constraint.kind === 'horizontalPoints') return 'H';
  if (constraint.kind === 'verticalPoints') return 'V';
  return CONSTRAINT_TOOLS.find((tool) => tool.id === constraint.kind)?.mark ?? null;
}

/** Where a mark goes, in plane coordinates: the middle of the first element it references. */
function anchorOf(sketch: Sketch, constraint: SketchConstraint): { x: number; y: number } | null {
  const target =
    constraint.kind === 'horizontal' || constraint.kind === 'vertical'
      ? constraint.line
      : constraint.kind === 'lock' ||
          constraint.kind === 'pointOn' ||
          constraint.kind === 'midpoint'
        ? constraint.point
        : constraint.kind === 'symmetric'
          ? constraint.about
          : 'a' in constraint
            ? constraint.a
            : null;
  if (target === null) return null;
  return middleOf(sketch, target);
}

function middleOf(sketch: Sketch, id: SketchId): { x: number; y: number } | null {
  const primitive = sketch.primitives.find((candidate) => candidate.id === id);
  const point = (pid: SketchId) => {
    const found = sketch.primitives.find((candidate) => candidate.id === pid);
    return found?.kind === 'point' ? found : null;
  };
  if (primitive === undefined) return null;
  if (primitive.kind === 'point') return { x: primitive.x, y: primitive.y };
  if (primitive.kind === 'line') {
    const a = point(primitive.start);
    const b = point(primitive.end);
    return a === null || b === null ? null : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  if (primitive.kind === 'spline') {
    const middle = primitive.points[Math.floor(primitive.points.length / 2)];
    return middle === undefined ? null : point(middle);
  }
  if (primitive.kind === 'ellipse') return point(primitive.vertex);
  const center = point(primitive.center);
  if (center === null) return null;
  const radius =
    primitive.kind === 'circle'
      ? primitive.radius
      : (() => {
          const start = point(primitive.start);
          return start === null ? 0 : Math.hypot(start.x - center.x, start.y - center.y);
        })();
  return { x: center.x + radius * Math.SQRT1_2, y: center.y + radius * Math.SQRT1_2 };
}

function uncapitalise(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
