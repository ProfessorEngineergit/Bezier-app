/**
 * The orientation cube, top right of the canvas. Drawn on one canvas (`view-cube-canvas.ts`), the
 * same bevelled solid on every system: the DOM version was dozens of 3D layers, which the browser
 * cut into pieces where its axis arms crossed them, and which a window without a GPU recomposited
 * every frame. The camera stays the source of truth: its rotation matrix is read each frame.
 *
 * A shaded, bevelled cube, an axis gnomon at its foot, and two quarter-turn arrows. Click a face
 * to square the view onto it, an edge for a 45° view, a corner for an isometric view; drag to
 * orbit, or press an arrow to rotate 90°. Every face, edge and corner is also a hidden button, for
 * the keyboard and for assistive technology, which a canvas cannot offer.
 */

/// <reference lib="dom" />

import type { CubeSide, ViewPlane } from '@bezier/renderer';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { cubeHover } from './square-view.js';
import {
  CANVAS_SIZE,
  type CubePalette,
  type Drawn,
  faceAt,
  paintCube,
  readPalette,
} from './view-cube-canvas.js';
import { CUBE, DRAG_THRESHOLD, labelOf, ORBIT_PER_PIXEL, pickFace } from './view-cube-model.js';
import './viewcube-canvas.css';
import type { ViewportHandle } from './Viewport.js';

export { CUBE_HALF, FACES } from './view-cube-model.js';

/**
 * A three-quarter arc with a solid head. A path rather than a font glyph, so it takes the button's
 * colour and the chrome's stroke weight.
 */
function SpinIcon() {
  return (
    <svg aria-hidden="true" height={15} viewBox="0 0 24 24" width={15}>
      <path
        d="M20 12a8 8 0 1 1-2.5-5.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={2.4}
      />
      <path d="M20.9 3.2v6.1h-6.1z" fill="currentColor" />
    </svg>
  );
}

export function ViewCube({
  animate = false,
  handleRef,
  onSketchPlane,
  onPicked,
}: {
  /** Whether a clicked face animates there or jumps. */
  animate?: boolean;
  handleRef: RefObject<ViewportHandle | null>;
  /** The plane the view now faces, while sketching: square to a side, or between sides. */
  onSketchPlane?: (plane: ViewPlane) => void;
  /** The sides a click looked from: one for a face, two for an edge, three for a corner. */
  onPicked?: (sides: readonly CubeSide[]) => void;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  // Read inside handlers bound once, so a preference change applies on the next click.
  const animateRef = useRef(animate);
  animateRef.current = animate;
  /** Set on press; a drag past the threshold suppresses the click that follows. */
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Each face's drawn shape, the hovered face, and the colours. */
  const drawn = useRef<Drawn>([]);
  const hovered = useRef(-1);
  const palette = useRef<CubePalette | null>(null);
  /** Read with the palette: asking the stylesheet on every frame of a turn forces a style pass. */
  const perspective = useRef(320);

  // The sync loop: reads the camera orientation each frame and draws the cube, never through React
  // state.
  useEffect(() => {
    let frame = 0;
    let written = '';
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const handle = handleRef.current;
      if (handle === null) return;

      // Draw nothing while the camera is still.
      const matrix = handle.viewCubeMatrix();
      const squared = handle.isOrthographic();
      const state = `${matrix.join(',')}|${String(squared)}|${hovered.current}|${palette.current === null}`;
      if (state === written) return;
      written = state;
      // Not React state: it is asked every frame, and a state update per frame is what this loop
      // avoids.
      rootRef.current?.classList.toggle('viewcube--squared', squared);

      const board = canvasRef.current;
      const root = rootRef.current;
      const context = board?.getContext('2d');
      if (board === null || root === null || context === null || context === undefined) return;
      // How squarely each side points at the viewer, 1 being head on: the view as the cube shows it,
      // for tests and tools to read.
      root.dataset.facing = JSON.stringify(
        Object.fromEntries(
          CUBE.filter((face) => face.kind === 'side').map((face) => [
            labelOf(face),
            Math.round(
              ((matrix[2] ?? 0) * face.normal[0] +
                (matrix[6] ?? 0) * face.normal[1] +
                (matrix[10] ?? 0) * face.normal[2]) *
                100,
            ) / 100,
          ]),
        ),
      );
      if (palette.current === null) {
        palette.current = readPalette(root);
        const read = Number.parseFloat(
          getComputedStyle(root).getPropertyValue('--cube-perspective'),
        );
        perspective.current = read > 0 ? read : 320;
      }
      drawn.current = paintCube(
        context,
        matrix,
        perspective.current,
        palette.current,
        hovered.current,
        Math.min(devicePixelRatio, 2),
      );
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [handleRef]);

  // Drag to orbit, tracked on the window so a fast drag off the cube keeps going. The pointer is also
  // tracked here for hover: the canvas only takes the pointer over a face, so the area around the
  // cube still reaches the model.
  useEffect(() => {
    let box: DOMRect | null = null;
    const forget = () => {
      box = null;
    };
    const onMove = (event: PointerEvent) => {
      const board = canvasRef.current;
      if (board !== null && drag.current === null) {
        box ??= board.getBoundingClientRect();
        const index = faceAt(drawn.current, event.clientX - box.left, event.clientY - box.top);
        board.style.pointerEvents = index >= 0 ? 'auto' : 'none';
        if (index !== hovered.current) {
          hovered.current = index;
          cubeHover.sides = CUBE[index]?.sides ?? null;
        }
      }
      const state = drag.current;
      const handle = handleRef.current;
      if (state === null || handle === null) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      state.moved = true;
      // Vertical negated: dragging the top down tilts it toward you (the camera rises).
      handle.orbit(dx * ORBIT_PER_PIXEL, -dy * ORBIT_PER_PIXEL);
      state.x = event.clientX;
      state.y = event.clientY;
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', forget);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', forget);
    };
  }, [handleRef]);

  // Re-read the colours when the theme changes.
  useEffect(() => {
    const stale = () => {
      palette.current = null;
    };
    const observer = new MutationObserver(stale);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', stale);
    return () => {
      observer.disconnect();
      scheme.removeEventListener('change', stale);
    };
  }, []);

  return (
    <nav className="viewcube" aria-label="Orientation" ref={rootRef}>
      {/* Quarter turns, shown only while the view is squared onto an axis, where a right angle
          takes one axis view to the next. */}
      <button
        aria-label="Rotate left"
        className="viewcube__spin viewcube__spin--left"
        onClick={() => handleRef.current?.spin(-Math.PI / 2, animateRef.current)}
        type="button"
      >
        <SpinIcon />
      </button>
      <button
        aria-label="Rotate right"
        className="viewcube__spin viewcube__spin--right"
        onClick={() => handleRef.current?.spin(Math.PI / 2, animateRef.current)}
        type="button"
      >
        <SpinIcon />
      </button>

      <div className="viewcube__stage">
        <canvas
          aria-label="Orientation cube"
          className="viewcube__canvas"
          height={CANVAS_SIZE * Math.min(devicePixelRatio, 2)}
          onClick={(event) => {
            if (drag.current?.moved === true) return;
            const box = event.currentTarget.getBoundingClientRect();
            const face =
              CUBE[faceAt(drawn.current, event.clientX - box.left, event.clientY - box.top)];
            if (face !== undefined)
              pickFace(face, handleRef.current, animateRef.current, onSketchPlane, onPicked);
          }}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, moved: false };
          }}
          ref={canvasRef}
          width={CANVAS_SIZE * Math.min(devicePixelRatio, 2)}
        />
        {/* The same targets for the keyboard and assistive technology, out of sight. */}
        {CUBE.map((face, index) => (
          <button
            aria-label={face.kind === 'side' ? undefined : `View from ${face.sides.join(', ')}`}
            className={face.kind === 'side' ? 'viewcube__face' : 'viewcube__zone'}
            data-corner={face.kind === 'corner' ? '' : undefined}
            data-face={face.kind === 'side' ? face.sides[0] : undefined}
            data-zone={face.kind === 'side' ? undefined : face.sides.join('-')}
            key={face.sides.join('-')}
            onBlur={() => {
              hovered.current = -1;
              cubeHover.sides = null;
            }}
            onClick={() =>
              pickFace(face, handleRef.current, animateRef.current, onSketchPlane, onPicked)
            }
            // Out of sight, so keyboard focus shows as the hover colour on the drawn face.
            onFocus={() => {
              hovered.current = index;
              cubeHover.sides = face.sides;
            }}
            onPointerEnter={() => {
              cubeHover.sides = face.sides;
            }}
            onPointerLeave={() => {
              cubeHover.sides = null;
            }}
            type="button"
          >
            {labelOf(face)}
          </button>
        ))}
      </div>
    </nav>
  );
}
