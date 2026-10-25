/** Move, planar translation and rotation share one world pivot and one preview transaction. */

import { typedNumber } from '@bezier/ui';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GizmoArrow } from './GizmoArrow.js';
import {
  AXES,
  type Axis,
  angleDelta,
  axisDistance,
  type Basis,
  PLANES,
  type Point,
  planeDistance,
  rotationStep,
  smoothSpeed,
} from './move-gizmo-math.js';
import type { TransformEdit } from './TransformTool.js';
import { useMoveGizmoFrame } from './use-move-gizmo-frame.js';
import type { MoveSnap } from './use-move-snap.js';
import { useWheelThrough } from './use-wheel-through.js';
import type { ViewportHandle } from './Viewport.js';
import './move-gizmo.css';

type Control =
  | { kind: 'axis'; axis: Axis }
  | { kind: 'plane'; a: Axis; b: Axis }
  | { kind: 'rotate'; axis: Axis; a: Axis; b: Axis };
type Drag = {
  control: Control;
  x: number;
  y: number;
  cx: number;
  cy: number;
  basis: Record<string, Basis>;
  angle: number;
  total: number;
  /** How fast the pointer is going round, in degrees a second, and when it was last seen. */
  speed: number;
  at: number;
  moved: boolean;
  repositioning: boolean;
};
interface MoveGizmoProps {
  handleRef: React.RefObject<ViewportHandle | null>;
  copy: boolean;
  busy: boolean;
  initialPivot: Point | null;
  onCopyChange: (copy: boolean) => void;
  translationOnly?: boolean;
  /** Only bodies and sketches can be copied, not faces or edges. */
  copyable?: boolean;
  onClose: () => void;
  onCommit: (delta: Point) => void;
  onRotate: (axis: Axis, angle: number, origin: Point) => void;
  onPreview: (edit: TransformEdit) => void;
  onCancel: () => void;
  /** Snap targets on other bodies and the grid, if any. */
  snapTo?: MoveSnap | undefined;
}
const ARC = 'M61 39 Q52 55 39 61 M53 37L61 39L63 31 M37 53L39 61L31 63';
/** Formats degrees with an explicit sign, so the direction of a turn is clear. */
const signed = (degrees: number) => {
  const rounded = Math.round(degrees * 100) / 100;
  return rounded > 0 ? `+${rounded}` : String(rounded);
};
const controlKey = (c: Control) =>
  c.kind === 'plane' ? `p-${c.a}${c.b}` : `${c.kind === 'axis' ? 't' : 'r'}-${c.axis}`;

export function MoveGizmo({
  handleRef,
  initialPivot,
  busy,
  copy,
  onCopyChange,
  onClose,
  onCommit,
  onRotate,
  onPreview,
  onCancel,
  translationOnly = false,
  copyable = true,
  snapTo,
}: MoveGizmoProps) {
  const frame = useMoveGizmoFrame(handleRef, initialPivot);
  useWheelThrough(frame.root);
  const drag = useRef<Drag | null>(null);
  const pending = useRef<TransformEdit | null>(null);
  const [selected, setSelected] = useState<Control | null>(null);
  const [value, setValue] = useState('0');
  const [dragging, setDragging] = useState(false);
  /** Start and current pointer position of a plane or axis drag, in page pixels. */
  const [trail, setTrail] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const input = useRef<HTMLInputElement | null>(null);
  /** The handle under the pointer, so a typed number goes to it. */
  const hovered = useRef<Control | null>(null);
  /** Digits already typed over the handle: the field takes focus a frame later, so the next key
   * arrives before it exists and is appended here. */
  const typedOver = useRef(false);
  const typedText = useRef('');
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const callbacks = useRef({ onPreview, onCancel, onCommit, onRotate, onClose });
  callbacks.current = { onPreview, onCancel, onCommit, onRotate, onClose };
  const snapRef = useRef(snapTo);
  snapRef.current = snapTo;
  /** The current snap target, shown beside the handle. */
  const [snapNote, setSnapNote] = useState<string | null>(null);
  /**
   * The last rotation, kept on screen until the next starts. The field resets to 0 for the next
   * turn, which adds to this one, so this shows what was applied.
   */
  const [lastTurn, setLastTurn] = useState<{ axis: Axis; degrees: number } | null>(null);

  const editFor = (control: Control, amount: number): TransformEdit | null => {
    const pivot = frame.pivot.current;
    if (!pivot) return null;
    if (control.kind === 'rotate')
      return {
        kind: 'rotate',
        axis: control.axis,
        angle: (amount * Math.PI) / 180,
        origin: { ...pivot },
      };
    if (control.kind === 'axis')
      return { kind: 'move', delta: { x: 0, y: 0, z: 0, [control.axis]: amount } };
    return null;
  };
  const finish = (commit: boolean) => {
    const edit = pending.current;
    const repositioning = drag.current?.repositioning === true;
    const dragged = drag.current?.moved === true;
    pending.current = null;
    drag.current = null;
    setSnapNote(null);
    frame.offset.current = { x: 0, y: 0, z: 0 };
    setDragging(false);
    setTrail(null);
    setValue('0');
    typedOver.current = false;
    if (!commit || !edit) {
      if (!repositioning) callbacks.current.onCancel();
      return;
    }
    if (edit.kind === 'move') {
      const p = frame.pivot.current;
      if (p)
        frame.pivot.current = {
          x: p.x + edit.delta.x,
          y: p.y + edit.delta.y,
          z: p.z + edit.delta.z,
        };
      if (!repositioning) callbacks.current.onCommit(edit.delta);
    } else {
      callbacks.current.onRotate(edit.axis, edit.angle, edit.origin);
      setLastTurn({ axis: edit.axis, degrees: (edit.angle * 180) / Math.PI });
    }
    if (edit.kind === 'move') setLastTurn(null);
    // A finished drag deselects its handle, or the arc or arrow stays in its pressed colour as if
    // hovered. A typed number keeps its handle, since the field belongs to it.
    if (dragged && !repositioning) setSelected(null);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const start = (event: React.PointerEvent, control: Control, repositioning = false) => {
    if (event.button !== 0 || busy) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = frame.root.current?.getBoundingClientRect();
    if (!rect || !frame.pivot.current) return;
    typedOver.current = false;
    setSelected(control);
    setValue('0');
    setLastTurn(null);
    const basis = structuredClone(frame.basis.current);
    const cx = rect.x,
      cy = rect.y;
    let angle = 0;
    if (control.kind === 'rotate') {
      const a = basis[control.a],
        b = basis[control.b];
      if (!a || !b) return;
      const p = planeDistance(a, b, event.clientX - cx, event.clientY - cy);
      angle = Math.atan2(p.b, p.a);
    }
    drag.current = {
      control,
      x: event.clientX,
      y: event.clientY,
      cx,
      cy,
      basis,
      angle,
      total: 0,
      speed: 0,
      at: event.timeStamp,
      moved: false,
      repositioning,
    };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = event.clientX - d.x,
        dy = event.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      setDragging(true);
      const c = d.control;
      const snap = (n: number) =>
        Math.round(n / (event.shiftKey ? 1 : 0.01)) * (event.shiftKey ? 1 : 0.01);
      let edit: TransformEdit;
      let amount: number;
      if (c.kind === 'axis') {
        const a = d.basis[c.axis];
        if (!a) return;
        amount = snap(axisDistance(a, dx, dy));
        edit = { kind: 'move', delta: { x: 0, y: 0, z: 0, [c.axis]: amount } };
      } else {
        const a = d.basis[c.a],
          b = d.basis[c.b];
        const pivot = frame.pivot.current;
        if (!a || !b || !pivot) return;
        if (c.kind === 'rotate') {
          const p = planeDistance(a, b, event.clientX - d.cx, event.clientY - d.cy);
          const angle = Math.atan2(p.b, p.a);
          const turned = angleDelta(d.angle, angle);
          d.total += turned;
          d.angle = angle;
          d.speed = smoothSpeed(d.speed, (turned * 180) / Math.PI, (event.timeStamp - d.at) / 1000);
          d.at = event.timeStamp;
          const step = rotationStep(d.speed, event.shiftKey);
          amount = Math.round((d.total * 180) / Math.PI / step) * step;
          edit = {
            kind: 'rotate',
            axis: c.axis,
            angle: (amount * Math.PI) / 180,
            origin: { ...pivot },
          };
        } else {
          const p = planeDistance(a, b, dx, dy);
          edit = { kind: 'move', delta: { x: 0, y: 0, z: 0, [c.a]: snap(p.a), [c.b]: snap(p.b) } };
          amount = Math.hypot(p.a, p.b);
        }
      }
      if (edit.kind === 'move' && c.kind !== 'rotate') {
        // Shift skips snapping to other bodies, keeping whole-millimetre rounding.
        const snapped = event.shiftKey ? undefined : snapRef.current;
        if (snapped === undefined) setSnapNote(null);
        else {
          const free: [boolean, boolean, boolean] =
            c.kind === 'axis'
              ? [c.axis === 'x', c.axis === 'y', c.axis === 'z']
              : [
                  c.a === 'x' || c.b === 'x',
                  c.a === 'y' || c.b === 'y',
                  c.a === 'z' || c.b === 'z',
                ];
          const result = snapped(edit.delta, free);
          edit = { kind: 'move', delta: result.delta };
          amount =
            c.kind === 'axis'
              ? result.delta[c.axis]
              : Math.hypot(result.delta[c.a], result.delta[c.b]);
          setSnapNote(result.note);
        }
      }
      if (c.kind !== 'rotate') {
        // The line runs from where the handle was grabbed to where it is now, not to the pointer:
        // an axis follows the pointer only along itself, and snapping makes the value lag it.
        const pivot = frame.pivot.current;
        const view = handleRef.current;
        const from = pivot === null ? null : view?.project(pivot.x, pivot.y, pivot.z);
        const to =
          pivot === null || edit.kind !== 'move'
            ? null
            : view?.project(pivot.x + edit.delta.x, pivot.y + edit.delta.y, pivot.z + edit.delta.z);
        setTrail(
          from && to
            ? { x0: d.x, y0: d.y, x1: d.x + to.x - from.x, y1: d.y + to.y - from.y }
            : { x0: d.x, y0: d.y, x1: event.clientX, y1: event.clientY },
        );
      }
      pending.current = edit;
      frame.offset.current = edit.kind === 'move' ? edit.delta : { x: 0, y: 0, z: 0 };
      setValue(String(Math.round(amount * 100) / 100));
      if (!d.repositioning) callbacks.current.onPreview(edit);
    };
    const up = () => {
      if (!drag.current) return;
      if (!drag.current.moved) {
        const repositioning = drag.current.repositioning;
        drag.current = null;
        if (!repositioning) {
          input.current?.focus();
          input.current?.select();
        }
        return;
      }
      finishRef.current(true);
    };
    const cancel = () => {
      if (drag.current || pending.current) finishRef.current(false);
    };
    // Capture phase, ahead of the app's Escape (which clears the selection and closes the tool):
    // cancel the drag and keep the tool.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (drag.current || pending.current) {
        event.stopPropagation();
        finishRef.current(false);
      } else callbacks.current.onClose();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
    };
  }, [frame.pivot, frame.offset, handleRef]);
  // Typing a number with the pointer over a handle sends it to that handle, like pressing the
  // handle and typing in its field.
  useEffect(() => {
    const typed = (event: KeyboardEvent) => {
      const control = hovered.current;
      if (control === null || drag.current || busyRef.current) return;
      if (event.ctrlKey || event.metaKey || event.altKey || !/^[0-9.-]$/.test(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable]'))
        return;
      event.preventDefault();
      event.stopPropagation();
      setSelected(control);
      typedText.current = (typedOver.current ? typedText.current : '') + event.key;
      typedOver.current = true;
      setValue(typedText.current);
      requestAnimationFrame(() => input.current?.focus());
    };
    window.addEventListener('keydown', typed, true);
    return () => window.removeEventListener('keydown', typed, true);
  }, []);
  const active = selected ? controlKey(selected) : '';
  /** The rotation plane, drawn as a ring during a turn or just after. */
  const turning = selected?.kind === 'rotate' ? selected.axis : (lastTurn?.axis ?? null);
  const turned =
    selected?.kind === 'rotate' && (dragging || typedNumber(value) !== 0)
      ? (typedNumber(value) ?? 0)
      : (lastTurn?.degrees ?? null);
  const activate = (event: React.KeyboardEvent, control: Control) => {
    if (!busy && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setSelected(control);
      setValue('0');
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.select();
      });
    }
  };
  return (
    <div className={`move-gizmo${dragging ? ' move-gizmo--dragging' : ''}`} ref={frame.root}>
      <button
        className="move-gizmo__origin"
        type="button"
        aria-label="Reposition move handle in selected plane"
        onPointerDown={(event) => {
          if (selected?.kind === 'plane') return start(event, selected, true);
          let best: (typeof PLANES)[number] = PLANES[0];
          let area = -1;
          for (const plane of PLANES) {
            const a = frame.basis.current[plane.a],
              b = frame.basis.current[plane.b];
            if (!a || !b) continue;
            const next = Math.abs(a.x * b.y - a.y * b.x);
            if (next > area) {
              area = next;
              best = plane;
            }
          }
          start(event, { kind: 'plane', a: best.a, b: best.b }, true);
        }}
      />
      <svg
        data-hidden={translationOnly ? '' : undefined}
        className="move-gizmo__turns"
        width="240"
        height="240"
        viewBox="0 0 240 240"
        aria-label="Rotation handles"
      >
        <title>Rotate around a world axis</title>
        {PLANES.map((p) => {
          const key = `r-${p.normal}`;
          const control: Control = { kind: 'rotate', axis: p.normal, a: p.a, b: p.b };
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG paths need a projected world-plane transform and a stroke-only hit area; keyboard activation is implemented below.
            <g
              key={key}
              ref={(el) => {
                frame.elements.current[key] = el;
              }}
              role="button"
              tabIndex={0}
              aria-label={`Rotate ${p.normal.toUpperCase()}`}
              aria-pressed={active === key}
              onPointerDown={(e) => start(e, control)}
              onPointerEnter={() => {
                hovered.current = control;
              }}
              onPointerLeave={() => {
                hovered.current = null;
              }}
              onKeyDown={(e) => activate(e, control)}
              className="move-gizmo__turn"
            >
              {turning === p.normal && (
                <circle className="move-gizmo__ring" r="112" vectorEffect="non-scaling-stroke" />
              )}
              <path d={ARC} className="move-gizmo__turn-hit" />
              <path
                d={ARC}
                className="move-gizmo__turn-outline"
                vectorEffect="non-scaling-stroke"
              />
              <path d={ARC} className="move-gizmo__turn-line" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>
      {PLANES.map((p) => {
        const key = `p-${p.key}`;
        const control: Control = { kind: 'plane', a: p.a, b: p.b };
        return (
          <button
            type="button"
            key={key}
            className="move-gizmo__plane"
            ref={(el) => {
              frame.elements.current[key] = el;
            }}
            aria-label={`Move ${p.key.toUpperCase()} plane`}
            aria-pressed={active === key}
            onPointerDown={(e) => start(e, control)}
            onKeyDown={(e) => activate(e, control)}
          />
        );
      })}
      {AXES.map((axis) => {
        const key = `t-${axis}`;
        const control: Control = { kind: 'axis', axis };
        return (
          <button
            type="button"
            key={key}
            className="move-gizmo__axis"
            ref={(el) => {
              frame.elements.current[key] = el;
            }}
            aria-label={`Move ${axis.toUpperCase()}`}
            aria-pressed={active === key}
            onPointerDown={(e) => start(e, control)}
            onPointerEnter={() => {
              hovered.current = control;
            }}
            onPointerLeave={() => {
              hovered.current = null;
            }}
            onKeyDown={(e) => activate(e, control)}
          >
            <GizmoArrow />
          </button>
        );
      })}
      {turning !== null && turned !== null && (
        <span
          className="move-gizmo__angle"
          ref={(el) => {
            frame.elements.current[`l-${turning}`] = el;
          }}
        >
          {signed(turned)}°
        </span>
      )}
      {trail !== null &&
        createPortal(
          // The drag path as a dashed line from its start, showing the direction on an angled view.
          <svg aria-hidden="true" className="move-gizmo__trail">
            <line x1={trail.x0} x2={trail.x1} y1={trail.y0} y2={trail.y1} />
            <circle cx={trail.x0} cy={trail.y0} r="3" />
          </svg>,
          document.body,
        )}
      <div className="move-gizmo__toolbar" role="toolbar" aria-label="Move and rotate">
        <div className="move-gizmo__heading">
          <strong>{copy ? 'Copy & move' : 'Move / Rotate'}</strong>
          {selected && (
            <span>
              {selected.kind === 'plane'
                ? `${selected.a.toUpperCase()}${selected.b.toUpperCase()} plane`
                : `${selected.axis.toUpperCase()} ${selected.kind === 'rotate' ? 'rotation' : 'axis'}`}
            </span>
          )}
          {lastTurn !== null && selected?.kind !== 'plane' && (
            <span className="move-gizmo__last">
              Last {lastTurn.axis.toUpperCase()} {signed(lastTurn.degrees)}°
            </span>
          )}
          {snapNote !== null && (
            <span className="move-gizmo__snap" role="status">
              {snapNote}
            </span>
          )}
        </div>
        {selected && selected.kind !== 'plane' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = typedNumber(value);
              if (busy || n === null || n === 0) return;
              pending.current = editFor(selected, n);
              finish(true);
            }}
          >
            <label className="move-gizmo__entry">
              <input
                ref={input}
                aria-label={selected.kind === 'rotate' ? 'Rotation angle' : 'Move distance'}
                // Text input so `2in` or `10*2` can be typed; still exposed as a spinbutton.
                role="spinbutton"
                aria-valuenow={typedNumber(value) ?? undefined}
                inputMode="decimal"
                type="text"
                value={value}
                disabled={dragging || busy}
                onChange={(e) => setValue(e.target.value)}
              />
              <span>{selected.kind === 'rotate' ? '°' : 'mm'}</span>
            </label>
          </form>
        )}
        {copyable && (
          <button
            className="move-gizmo__copy-toggle"
            type="button"
            aria-label="Copy"
            aria-pressed={copy}
            disabled={dragging || busy}
            onClick={() => onCopyChange(!copy)}
          >
            <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="2" />
              <path d="M12 4V3H3v9h1" />
            </svg>
            Copy
          </button>
        )}
        <button
          className="move-gizmo__done"
          type="button"
          onClick={onClose}
          disabled={dragging || busy}
        >
          Done
        </button>
      </div>
    </div>
  );
}
