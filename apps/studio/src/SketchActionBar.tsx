/**
 * Parameters for an operation on the sketch selection (offset distance, repeat count, move or
 * rotate amount). A floating bar at the bottom of the canvas styled like the move gizmo
 * (`move-gizmo.css`); Done applies, Escape cancels.
 */

import type { Sketch, SketchId } from '@bezier/solver';
import {
  type EditResult,
  offsetSelection,
  type Point2D,
  patternSelection,
  textToSketch,
  transformSelection,
  typedNumber,
} from '@bezier/ui';
import { useEffect, useState } from 'react';
import './move-gizmo.css';
import { SKETCH_FONTS, type SketchFontName, sketchFont } from './sketch-font.js';

export type SketchAction = 'sketch-offset' | 'sketch-pattern' | 'sketch-transform' | 'sketch-text';

const TITLES: Record<SketchAction, string> = {
  'sketch-offset': 'Offset',
  'sketch-pattern': 'Pattern',
  'sketch-transform': 'Transform',
  'sketch-text': 'Text',
};

export function SketchActionBar({
  action,
  sketch,
  selected,
  onApply,
  onClose,
  placeAt = null,
}: {
  action: SketchAction;
  sketch: Sketch;
  /** The last click in the sketch while Text is open: the start of its baseline. */
  placeAt?: Point2D | null;
  selected: readonly SketchId[];
  onApply: (result: EditResult) => boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    distance: '2',
    count: '3',
    du: '10',
    dv: '0',
    angle: '360',
    mu: '0',
    mv: '0',
    turn: '0',
    scale: '1',
    text: 'Text',
    height: '10',
    x: '0',
    y: '0',
  });
  const [polar, setPolar] = useState(false);
  const [fontName, setFontName] = useState<SketchFontName>('Archivo');
  useEffect(() => {
    if (placeAt === null) return;
    const mm = (n: number) => String(Math.round(n * 100) / 100);
    setValues((current) => ({ ...current, x: mm(placeAt.u), y: mm(placeAt.v) }));
  }, [placeAt]);
  // Closes itself on Escape, like an open panel; the app's own Escape ignores it.
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  // Accepts units, arithmetic and a decimal comma, as other number fields do.
  const read = (key: string) => typedNumber(values[key] ?? '') ?? Number.NaN;

  const apply = () => {
    if (action === 'sketch-text') {
      // Placed from the start of its baseline; Transform moves it afterwards.
      void Promise.all([sketchFont(fontName), sketchFont('Noto Sans')])
        .then(([font, fallback]) => {
          const placed = textToSketch(
            sketch,
            font,
            values.text ?? '',
            { u: read('x') || 0, v: read('y') || 0 },
            read('height') || 10,
            fallback,
          );
          if (onApply({ ok: true, sketch: placed })) onClose();
        })
        .catch((error: unknown) =>
          onApply({ ok: false, message: error instanceof Error ? error.message : String(error) }),
        );
      return;
    }
    const centre = centreOf(sketch, selected);
    let result: EditResult;
    if (action === 'sketch-offset') result = offsetSelection(sketch, selected, read('distance'));
    else if (action === 'sketch-pattern') {
      const pivot = polar ? pivotOf(sketch, selected) : null;
      // The pivot is the centre of rotation, not something to repeat.
      const repeated = pivot === null ? selected : selected.filter((id) => id !== pivot.id);
      result = patternSelection(
        sketch,
        repeated,
        polar
          ? {
              kind: 'polar',
              count: Math.round(read('count')),
              center: pivot?.at ?? { u: 0, v: 0 },
              angle: (read('angle') * Math.PI) / 180,
            }
          : {
              kind: 'linear',
              count: Math.round(read('count')),
              step: { u: read('du'), v: read('dv') },
            },
      );
    } else {
      const turn = (read('turn') * Math.PI) / 180;
      const scale = read('scale') || 1;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      result = transformSelection(
        sketch,
        selected,
        (p) => {
          const x = (p.u - centre.u) * scale;
          const y = (p.v - centre.v) * scale;
          return {
            u: centre.u + x * cos - y * sin + read('mu'),
            v: centre.v + x * sin + y * cos + read('mv'),
          };
        },
        scale,
      );
    }
    if (onApply(result)) onClose();
  };

  const field = (key: string, label: string, unit: string) => (
    <label className="move-gizmo__entry" key={key}>
      <span>{label}</span>
      <input
        aria-label={label}
        inputMode={key === 'text' ? 'text' : 'decimal'}
        onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
        onKeyDown={(event) => {
          // Typing here must not trigger shortcuts; Escape still reaches the bar's listener.
          if (event.key !== 'Escape') event.stopPropagation();
          if (event.key === 'Enter') apply();
        }}
        value={values[key] ?? ''}
      />
      {unit !== '' && <span>{unit}</span>}
    </label>
  );

  return (
    <section aria-label={TITLES[action]} className="move-gizmo__toolbar sketch-action-bar">
      <div className="move-gizmo__heading">
        <strong>{TITLES[action]}</strong>
        <span>
          {action === 'sketch-text'
            ? 'Click in the sketch where it starts'
            : selected.length === 0
              ? 'Select elements first'
              : `${selected.length} selected`}
        </span>
      </div>
      {action === 'sketch-offset' && field('distance', 'Distance', 'mm')}
      {action === 'sketch-text' && [
        <label className="move-gizmo__entry sketch-action-bar__text" key="text">
          <span>Text</span>
          {/* Multi-line: Enter adds a line, ⌘ or Ctrl with Enter places the text. */}
          <textarea
            aria-label="Text"
            onChange={(event) => setValues((current) => ({ ...current, text: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') event.stopPropagation();
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) apply();
            }}
            rows={Math.min(4, Math.max(1, (values.text ?? '').split('\n').length))}
            value={values.text ?? ''}
          />
        </label>,
        <label className="move-gizmo__entry" key="font">
          <span>Font</span>
          <select
            aria-label="Font"
            onChange={(event) => setFontName(event.target.value as SketchFontName)}
            value={fontName}
          >
            {Object.keys(SKETCH_FONTS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>,
        field('height', 'Height', 'mm'),
        field('x', 'X', 'mm'),
        field('y', 'Y', 'mm'),
      ]}
      {action === 'sketch-pattern' && (
        <>
          <button
            aria-pressed={polar}
            className="move-gizmo__copy-toggle"
            onClick={() => setPolar((on) => !on)}
            type="button"
          >
            {polar ? 'Polar' : 'Linear'}
          </button>
          {field('count', 'Count', '')}
          {polar
            ? field('angle', 'Angle', '°')
            : [field('du', 'Step X', 'mm'), field('dv', 'Step Y', 'mm')]}
        </>
      )}
      {action === 'sketch-transform' && [
        field('mu', 'Move X', 'mm'),
        field('mv', 'Move Y', 'mm'),
        field('turn', 'Rotate', '°'),
        field('scale', 'Scale', '×'),
      ]}
      <button className="move-gizmo__copy-toggle" onClick={onClose} type="button">
        Cancel
      </button>
      <button
        className="move-gizmo__done"
        disabled={selected.length === 0 && action !== 'sketch-text'}
        onClick={apply}
        type="button"
      >
        Done
      </button>
    </section>
  );
}

/** The centre of the selection, about which rotation and scale apply. */
function centreOf(sketch: Sketch, selected: readonly SketchId[]): Point2D {
  const ids = new Set<SketchId>();
  for (const p of sketch.primitives) {
    if (!selected.includes(p.id)) continue;
    if (p.kind === 'point') ids.add(p.id);
    if (p.kind === 'line') for (const id of [p.start, p.end]) ids.add(id);
    if (p.kind === 'circle' || p.kind === 'arc') ids.add(p.center);
    if (p.kind === 'arc') for (const id of [p.start, p.end]) ids.add(id);
  }
  const points = sketch.primitives.filter((p) => p.kind === 'point' && ids.has(p.id));
  if (points.length === 0) return { u: 0, v: 0 };
  let u = 0;
  let v = 0;
  for (const p of points) if (p.kind === 'point') (u += p.x), (v += p.y);
  return { u: u / points.length, v: v / points.length };
}

/** The pivot of a polar pattern: the point picked with it, or the sketch origin. */
function pivotOf(
  sketch: Sketch,
  selected: readonly SketchId[],
): { id: SketchId; at: Point2D } | null {
  for (const id of [...selected].reverse()) {
    const p = sketch.primitives.find((candidate) => candidate.id === id);
    if (p?.kind === 'point') return { id, at: { u: p.x, v: p.y } };
  }
  return null;
}
