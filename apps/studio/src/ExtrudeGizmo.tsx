/**
 * On-canvas drag handle for the extrude distance. Previews live during a drag (`onPreview`) without
 * recording, and commits one journal entry on release (`onCommit`).
 *
 * The arrow follows the projected outward normal; only the value label stays upright.
 *
 * With a face selected it edits that face's extrude. Given an `anchor` and no face, it is the offer
 * on a clicked sketch profile: the distance starts at zero and only a drag or a typed number
 * creates the feature.
 *
 * Escape is handled by the cascade in `use-shortcuts`, not here, so an offer is dismissed before
 * the selection is cleared.
 */

/// <reference lib="dom" />

import type { StableRef } from '@bezier/core';
import { typedNumber } from '@bezier/ui';
import { useEffect, useRef, useState } from 'react';
import { px, setStyle } from './dom-writes.js';
import { GizmoArrow } from './GizmoArrow.js';
import { projectDirection, type WorldPoint } from './gizmo-direction.js';
import { useGizmoAnchor } from './use-gizmo-anchor.js';
import type { ViewportHandle } from './Viewport.js';

export interface ExtrudeGizmoProps {
  distance: number;
  label?: string;
  valueLabel?: string;
  showOptions?: boolean;
  directionMode: 'forward' | 'backward' | 'symmetric';
  /** What the menu shows outside signed mode; `through` is a cut right through. */
  operation: PullSense;
  /**
   * Which results the Result chooser offers, in order, outside signed mode. Defaults to the full
   * set. Signed mode always offers joining, cutting, cutting through and a new body.
   */
  operations?: readonly PullSense[];
  /**
   * Whether the Direction chooser is shown. Hidden for face pulls, where the result and the drag
   * already determine direction.
   */
  showDirection?: boolean;
  /**
   * Signed distance mode, for face pulls: pulling out along the normal adds, pushing back through
   * the face cuts, and the value passes through zero. A typed negative also cuts. The Result and
   * Direction choosers are hidden. When off (the default), the gizmo reports a positive magnitude
   * and the choosers decide add or cut, as the sketch-profile offer needs.
   */
  signed?: boolean;
  /**
   * Signed mode: called when the menu changes what a pull out or push in makes beyond join and cut
   * (a new body, or a cut through). The distance's sign still picks the side.
   */
  onSenseChange?: (sense: PullSense) => void;
  canCombine: boolean;
  /** The selected face; its centroid is the anchor instead of the content centre. */
  faceRef: StableRef | null;
  /**
   * A world anchor overriding both of the above, for the profile offer: a sketch has no B-Rep face,
   * and the content centre may be far from the clicked profile.
   */
  anchor?: { x: number; y: number; z: number };
  /** The sketch plane's normal, before a profile has a selectable face. */
  normal?: WorldPoint;
  handleRef: React.RefObject<ViewportHandle | null>;
  onCommit: (distance: number) => void;
  onDirectionChange: (direction: 'forward' | 'backward' | 'symmetric') => void;
  onOperationChange: (operation: PullSense) => void;
  onPreview: (distance: number) => void;
}

/** Initial value for the mm-per-pixel ref before the first frame measures the camera. */
const MM_PER_PIXEL_FALLBACK = 0.05;
const SIGNED_OPERATIONS = ['add', 'cut', 'through', 'new'] as const;
/** What a signed pull makes: joined or apart when pulled out, cut by the distance or through. */
export type PullSense = (typeof SIGNED_OPERATIONS)[number];
const CUTTING: readonly PullSense[] = ['cut', 'through'];
/** With no body to add to or cut from, a new body is all there is. */
const NEW_ONLY = ['new'] as const;
/**
 * How far the handle sits outside the face, in pixels. A handle on the centroid would catch the
 * second click of a double-click, breaking double-click-to-select-body once a face is selected.
 */
const HANDLE_REACH = 14;
const VALUE_REACH = 82;
export function ExtrudeGizmo({
  distance,
  label = 'Extrude',
  valueLabel = 'Extrude distance',
  showOptions = true,
  directionMode,
  operation,
  operations = ['new', 'add', 'cut', 'through'],
  showDirection = true,
  signed = false,
  onSenseChange,
  canCombine,
  faceRef,
  anchor,
  normal,
  handleRef,
  onCommit,
  onDirectionChange,
  onOperationChange,
  onPreview,
}: ExtrudeGizmoProps) {
  const placement = useGizmoAnchor(handleRef);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const originElRef = useRef<HTMLButtonElement | null>(null);
  const placedCentre = useRef({ x: 0, y: 0, z: 0 });
  const handleElRef = useRef<HTMLButtonElement | null>(null);
  const valueElRef = useRef<HTMLDivElement | null>(null);
  const inputElRef = useRef<HTMLInputElement | null>(null);
  const [live, setLive] = useState(distance);
  const [text, setText] = useState(() => trim(distance));
  const drag = useRef<{ x: number; y: number; dx: number; dy: number; from: number } | null>(null);
  const outward = useRef({ x: 0, y: -1 });
  const [optionsOpen, setOptionsOpen] = useState(false);
  const cancelBlur = useRef(false);
  /**
   * Add or cut as chosen in the menu, for a pull still at zero. Once there is a distance its sign
   * decides, and this is only the fallback.
   */
  const [sense, setSense] = useState<PullSense>('add');
  const senseRef = useRef(sense);
  senseRef.current = sense;
  /**
   * The distance as of the last drag tick, read on release. Not read through `setLive`'s functional
   * updater: React may call updaters during render (twice under StrictMode), and committing there
   * sets App state mid-render, which React logs and the end-to-end suite fails on. Same as
   * `lastSize` in EdgeGizmo.
   */
  const liveRef = useRef(distance);
  /**
   * World millimetres per screen pixel, refreshed every frame from the camera and the gizmo's
   * distance, so a drag reports the value under the cursor at the current zoom.
   */
  const mmPerPixel = useRef(MM_PER_PIXEL_FALLBACK);

  // Arm numeric entry without taking focus on selection, which would swallow Delete, deselect and
  // tool shortcuts. A first digit or sign focuses the field and replaces the value.
  useEffect(() => {
    if (!signed) return;
    const startTyping = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || !/^[0-9.-]$/.test(event.key)) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input,textarea,select') || target.isContentEditable)
      )
        return;
      const input = inputElRef.current;
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      input.focus();
      setText(event.key);
      const parsed = Number(event.key);
      if (Number.isFinite(parsed)) {
        setLive(parsed);
        liveRef.current = parsed;
        onPreview(parsed);
      }
    };
    window.addEventListener('keydown', startTyping, true);
    return () => window.removeEventListener('keydown', startTyping, true);
  }, [signed, onPreview]);

  // Sync live display when the committed distance changes from outside.
  useEffect(() => {
    setLive(distance);
    setText(trim(distance));
    liveRef.current = distance;
  }, [distance]);

  function previewText(next: string): void {
    setText(next);
    const parsed = Number(next);
    // Signed mode accepts negatives (cuts) and zero; magnitude mode needs a positive number.
    if (!Number.isFinite(parsed) || (!signed && parsed <= 0)) return;
    setLive(parsed);
    liveRef.current = parsed;
    onPreview(parsed);
  }

  function commitText(): void {
    if (cancelBlur.current) {
      cancelBlur.current = false;
      return;
    }
    const parsed = typedNumber(text) ?? Number.NaN;
    if (!Number.isFinite(parsed) || (!signed && parsed <= 0)) {
      setText(trim(distance));
      return;
    }
    onCommit(parsed);
  }

  // Pin the gizmo to the face centroid every frame so it follows the orbit and stays on the picked
  // surface, not at the model's bounding-box centre.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const root = rootRef.current;
      const handle = handleRef.current;
      if (root === null || handle === null) return;
      const base =
        anchor ?? (faceRef !== null ? handle.faceCentroid(faceRef) : handle.contentCenter());
      const delta = placement.offset.current;
      const centre = base === null ? null : placedCentre.current;
      if (centre !== null && base !== null) {
        centre.x = base.x + delta.x;
        centre.y = base.y + delta.y;
        centre.z = base.z + delta.z;
      }
      const at = centre === null ? null : handle.project(centre.x, centre.y, centre.z);
      if (at === null || centre === null) {
        setStyle(root, 'visibility', 'hidden');
        return;
      }
      setStyle(root, 'visibility', 'visible');
      setStyle(root, 'left', px(at.x));
      setStyle(root, 'top', px(at.y));

      const eye = handle.cameraPosition();
      const eyeDistance = Math.hypot(eye.x - centre.x, eye.y - centre.y, eye.z - centre.z);
      mmPerPixel.current = handle.worldPerPixelAt(eyeDistance);

      if (drag.current === null) {
        const direction = faceRef !== null ? handle.faceNormal(faceRef) : normal;
        if (direction) {
          // In signed mode the drag axis is always the outward normal; the value's sign decides
          // which way the arrow reads (`displaySign` below).
          const sign = !signed && faceRef === null && directionMode === 'backward' ? -1 : 1;
          projectDirection(
            handle,
            centre,
            { x: direction.x * sign, y: direction.y * sign, z: direction.z * sign },
            at,
            outward.current,
          );
        }
      }
      // A cut points the arrow back through the face; otherwise it follows the outward normal.
      const cutting =
        liveRef.current < 0 || (liveRef.current === 0 && CUTTING.includes(senseRef.current));
      const displaySign = signed && cutting ? -1 : 1;
      const dir = { x: outward.current.x * displaySign, y: outward.current.y * displaySign };
      const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;

      const handleEl = handleElRef.current;
      // Keep the pivot outside the surface so the second click can still select the body.
      if (originElRef.current !== null)
        setStyle(originElRef.current, 'transform', `translate(${dir.x * 48}px, ${dir.y * 48}px)`);
      if (handleEl !== null) {
        setStyle(
          handleEl,
          'transform',
          `translate(${dir.x * HANDLE_REACH}px, ${dir.y * HANDLE_REACH}px) translate(-50%, -50%) rotate(${angle}deg)`,
        );
      }
      const valueEl = valueElRef.current;
      if (valueEl !== null) {
        const reach = VALUE_REACH + (Math.abs(dir.x) * valueEl.offsetWidth) / 2;
        setStyle(
          valueEl,
          'transform',
          `translate(${px(dir.x * reach)}, ${px(dir.y * reach)}) translate(-50%, -50%)`,
        );
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [anchor, faceRef, normal, directionMode, handleRef, signed, placement.offset]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const state = drag.current;
      if (state === null) return;
      const along = (event.clientX - state.x) * state.dx + (event.clientY - state.y) * state.dy;
      const value = state.from + along * mmPerPixel.current;
      // Signed mode reports the pull as is: dragging back through the face goes negative (a cut)
      // through zero. Magnitude mode clamps positive and leaves direction to the arrow.
      const rounded = signed
        ? Math.round(value * 100) / 100
        : Math.round(Math.max(0.01, value) * 100) / 100;
      // A cut chosen in the menu before pulling: pulling out then means pulling in.
      const taken =
        signed && state.from === 0 && CUTTING.includes(senseRef.current)
          ? -Math.abs(rounded)
          : rounded;
      setLive(taken);
      setText(trim(taken));
      liveRef.current = taken;
      onPreview(taken);
    };
    const onUp = () => {
      if (drag.current === null) return;
      drag.current = null;
      // Commit once, from the ref `onMove` kept current, outside any state updater React may
      // replay. Zero commits nothing; signed mode lets negatives (cuts) through.
      if (liveRef.current !== 0) onCommit(liveRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [onPreview, onCommit, signed]);

  return (
    <div className="extrude-gizmo" ref={rootRef}>
      <button
        type="button"
        className="gizmo-anchor"
        aria-label={`Reposition ${label.toLowerCase()} handle`}
        ref={originElRef}
        onPointerDown={(event) => {
          const handle = handleRef.current;
          const at =
            anchor ?? (faceRef !== null ? handle?.faceCentroid(faceRef) : handle?.contentCenter());
          const axis = faceRef !== null ? handle?.faceNormal(faceRef) : normal;
          if (at && axis) placement.start(event, at, axis);
        }}
        onPointerMove={placement.move}
        onPointerUp={placement.end}
        onPointerCancel={placement.cancel}
      />
      {/* The inner arrowhead points from outside back toward the face. */}
      <button
        aria-label={`Drag to change ${valueLabel.toLowerCase()}`}
        className="extrude-gizmo__handle"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            dx: outward.current.x,
            dy: outward.current.y,
            from: live,
          };
          setOptionsOpen(false);
          event.preventDefault();
        }}
        ref={handleElRef}
        type="button"
      >
        <GizmoArrow />
      </button>
      <div className="extrude-gizmo__value" ref={valueElRef}>
        {signed || !showOptions ? (
          // No menu in signed mode: the drag direction and a typed sign already decide add or cut.
          <span className="extrude-gizmo__options-button" aria-hidden="true">
            {label}
          </span>
        ) : (
          <button
            className="extrude-gizmo__options-button"
            type="button"
            aria-label="Extrude options"
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen((open) => !open)}
          >
            Extrude <span aria-hidden="true">⌄</span>
          </button>
        )}
        <label className="extrude-gizmo__distance">
          <input
            ref={inputElRef}
            aria-label={valueLabel}
            inputMode={signed ? 'text' : 'decimal'}
            min={signed ? undefined : 0.01}
            onBlur={commitText}
            onChange={(event) => previewText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setLive(distance);
                liveRef.current = distance;
                setText(trim(distance));
                onPreview(distance);
                cancelBlur.current = true;
                event.stopPropagation();
                event.currentTarget.blur();
              }
            }}
            step={0.01}
            // Some browsers drop a lone leading "-" in number inputs, so signed mode uses a text
            // field and parses the sign itself.
            type={signed ? 'text' : 'number'}
            value={text}
          />
          <span>mm</span>
        </label>
        {/* What the extrude makes, always visible beside the number: a new body, added material,
            or a cut. On a face pull the menu reads and sets the distance's sign. */}
        {showOptions && (
          <select
            aria-label="Extrude result"
            className="extrude-gizmo__result"
            onChange={(event) => {
              const chosen = event.target.value as PullSense;
              if (!signed) return onOperationChange(chosen);
              setSense(chosen);
              senseRef.current = chosen;
              onSenseChange?.(chosen);
              const cut = CUTTING.includes(chosen);
              // Through needs no distance of its own; any cut must carry a cut's sign.
              const from = liveRef.current === 0 && chosen === 'through' ? 1 : liveRef.current;
              if (from === 0) return;
              const next = cut ? -Math.abs(from) : Math.abs(from);
              setLive(next);
              setText(trim(next));
              liveRef.current = next;
              onPreview(next);
              onCommit(next);
            }}
            value={signed ? shownSense(liveRef.current, sense) : operation}
          >
            {(signed ? SIGNED_OPERATIONS : canCombine ? operations : NEW_ONLY).map((option) => (
              <option key={option} value={option}>
                {RESULT_LABELS[option]}
              </option>
            ))}
          </select>
        )}
        {optionsOpen && showDirection && (
          <div className="extrude-gizmo__options">
            {showDirection && (
              <label>
                Direction
                <select
                  aria-label="Extrude direction"
                  onChange={(event) =>
                    onDirectionChange(event.target.value as 'forward' | 'backward' | 'symmetric')
                  }
                  value={directionMode}
                >
                  <option value="forward">Forward</option>
                  <option value="backward">Backward</option>
                  <option value="symmetric">Symmetric</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The sense the menu shows for a signed pull: the sign picks the side, `sense` the option. */
function shownSense(value: number, sense: PullSense): PullSense {
  if (value < 0) return sense === 'through' ? 'through' : 'cut';
  if (value > 0) return sense === 'new' ? 'new' : 'add';
  return sense;
}

const RESULT_LABELS: Record<PullSense, string> = {
  new: 'New body',
  add: 'Add to body',
  through: 'Cut through all',
  cut: 'Cut from body',
};

function trim(value: number): string {
  return String(Number(value.toFixed(2)));
}
