/**
 * Select through: a right-click on the model lists every body under the pointer, nearest first,
 * including hidden ones; picking one selects it. Hovering an entry highlights its body through
 * whatever is in front.
 *
 * Opens on a right-click, not a right-drag, since several navigation presets orbit with the right
 * button.
 */

import type { BodySummary, StableRef } from '@bezier/core';
import { formatRef } from '@bezier/core';
import type { Viewport } from '@bezier/renderer';
import { type RefObject, useEffect, useRef, useState } from 'react';
import './menu.css';

/** How far the pointer may travel between press and release and still be a click. */
const CLICK_SLOP_PX = 4;

/** The bodies a sequence of faces belongs to, in face order, without duplicates. */
export function bodiesAlong(
  bodies: readonly BodySummary[],
  faces: readonly StableRef[],
): BodySummary[] {
  const owner = new Map<string, BodySummary>();
  for (const body of bodies) for (const face of body.faces) owner.set(formatRef(face), body);
  const out: BodySummary[] = [];
  for (const face of faces) {
    const body = owner.get(formatRef(face));
    if (body !== undefined && !body.hidden && !out.includes(body)) out.push(body);
  }
  return out;
}

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sceneRef: RefObject<Viewport | null>;
  bodies: readonly BodySummary[];
  /** Selects a whole body by one of its faces, as a double-click does. */
  onSelectBody: (ref: StableRef | null, additive: boolean) => void;
}

export function PickThrough({ canvasRef, sceneRef, bodies, onSelectBody }: Props) {
  const [open, setOpen] = useState<{ x: number; y: number; bodies: BodySummary[] } | null>(null);
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let down: { x: number; y: number } | null = null;
    const press = (event: PointerEvent) => {
      down = event.button === 2 ? { x: event.clientX, y: event.clientY } : null;
    };
    const release = (event: PointerEvent) => {
      const start = down;
      down = null;
      const scene = sceneRef.current;
      if (event.button !== 2 || start === null || scene === null) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return;
      const box = canvas.getBoundingClientRect();
      const under = bodiesAlong(
        bodiesRef.current,
        scene.pickThrough(event.clientX - box.left, event.clientY - box.top),
      );
      if (under.length > 0) setOpen({ x: event.clientX, y: event.clientY, bodies: under });
    };
    canvas.addEventListener('pointerdown', press);
    canvas.addEventListener('pointerup', release);
    return () => {
      canvas.removeEventListener('pointerdown', press);
      canvas.removeEventListener('pointerup', release);
    };
  }, [canvasRef, sceneRef]);

  useEffect(() => {
    if (open === null) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  if (open === null) return null;
  const done = () => {
    sceneRef.current?.setHighlighted([]);
    setOpen(null);
  };
  return (
    <div className="pick-through" style={{ left: open.x, top: open.y }}>
      <button aria-label="Close menu" className="menu__scrim" onClick={done} type="button" />
      <div aria-label="Select through this point" className="menu" role="menu">
        <div className="menu__heading">Select through this point</div>
        {open.bodies.map((body, index) => (
          <button
            className="menu__item"
            key={body.key}
            onClick={() => {
              done();
              onSelectBody(body.faces[0] ?? null, false);
            }}
            onFocus={() => sceneRef.current?.setHighlighted(body.faces)}
            onMouseEnter={() => sceneRef.current?.setHighlighted(body.faces)}
            role="menuitem"
            type="button"
          >
            {body.label}
            {index === 0 ? <span className="menu__hint">nearest</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
