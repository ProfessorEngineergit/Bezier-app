/**
 * The active sketch's plane placement, editable while drawing: offset, tilt and rotation. The
 * fields are the sketch feature's own, rendered by the same generated panel as the inspector, so
 * they read and convert identically.
 */

import { getFeature, type ParamsSpec } from '@bezier/core';
import { PropertyPanel } from '@bezier/ui';
import { type ActiveSurface, leaningSurface } from './use-sketch.js';
import './move-gizmo.css';

const KEYS = ['offset', 'tilt', 'turn'] as const;

function leanSpec(): ParamsSpec {
  const all = getFeature('sketch')?.params ?? {};
  return Object.fromEntries(KEYS.flatMap((key) => (all[key] ? [[key, all[key]]] : [])));
}

/** A text label for the sketch plane, shown under Finish Sketch and in this bar. */
export function surfaceLabel(surface: ActiveSurface | null): string {
  if (surface === null) return 'No active plane';
  return surface.face !== null ? 'On a face' : `${surface.plane} plane`;
}

export function SketchPlanePanel({
  surface,
  freedom = null,
  onChange,
}: {
  surface: ActiveSurface;
  /** The draft's remaining degrees of freedom, shown beside the plane. */
  freedom?: number | null;
  onChange: (next: ActiveSurface) => void;
}) {
  return (
    <aside aria-label="Sketch plane" className="inspector move-gizmo__toolbar">
      <div className="move-gizmo__heading">
        <strong>Sketch plane</strong>
        <span>
          {surfaceLabel(surface)}
          {freedom === null
            ? ''
            : freedom === 0
              ? ' · Fully defined'
              : ` · ${freedom} ${freedom === 1 ? 'freedom' : 'freedoms'} left`}
        </span>
      </div>
      <PropertyPanel
        featureId="sketch-plane"
        onChange={(key, value) => {
          if (typeof value !== 'number' || !KEYS.some((k) => k === key)) return;
          onChange(leaningSurface(surface, { ...surface.lean, [key]: value }));
        }}
        params={{ ...surface.lean }}
        spec={leanSpec()}
      />
    </aside>
  );
}
