/**
 * The orientation cube, top right of the canvas. Drawn in the DOM rather than the scene so face
 * labels stay crisp. Synced every frame by writing the camera's rotation matrix into a `matrix3d`
 * transform; the camera remains the source of truth.
 *
 * A shaded, bevelled cube, an axis gnomon at its foot, and two quarter-turn arrows. Click a face
 * to square the view onto it, an edge for a 45° view, a corner for an isometric view; drag to
 * orbit, or press an arrow to rotate 90°.
 */

/// <reference lib="dom" />

import type { CubeSide, ViewPlane } from '@bezier/renderer';
import type { CSSProperties, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { paintFor } from './glass-fallback.js';
import { cubeHover } from './square-view.js';
import {
  CANVAS_SIZE,
  type CubePalette,
  type Drawn,
  faceAt,
  paintCube,
  readPalette,
} from './view-cube-canvas.js';
import type { CubeFace } from './view-cube-geometry.js';
import {
  AXES,
  AXIS_PARTS,
  CORE,
  CUBE,
  DRAG_THRESHOLD,
  labelOf,
  ORBIT_PER_PIXEL,
  pickFace,
  shadeOf,
} from './view-cube-model.js';
import './viewcube-zones.css';
import type { ViewportHandle } from './Viewport.js';

export { CUBE_HALF, FACES } from './view-cube-model.js';

const fillFor = (lit: number) => `color-mix(in srgb, var(--cube-light) ${lit}%, var(--cube-dark))`;

/**
 * A face's box and initial shade, a mix of the cube's lit and unlit tones so both themes can set
 * them. The sync loop then updates the shade with the view.
 */
function styleOf(face: CubeFace): CSSProperties {
  const lit = Math.round(face.light * 100);
  return {
    width: `${face.width}px`,
    height: `${face.height}px`,
    transform: face.transform,
    clipPath: face.clipPath,
    '--face-fill': fillFor(lit),
  } as CSSProperties;
}

/**
 * Whether the cube is drawn on a canvas: without graphics acceleration (`glass-fallback.ts`), where
 * its 3D layers cost the whole window its frame rate (`view-cube-canvas.ts`).
 */
function onCanvas(): boolean {
  return typeof document !== 'undefined' && paintFor() === 'light';
}

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
  const cubeRef = useRef<HTMLDivElement | null>(null);
  /** Each face's element, and the shade last written to it, by index in `CUBE`. */
  const faceRefs = useRef<Array<HTMLElement | null>>([]);
  const shades = useRef<number[]>([]);
  const labelRefs = useRef<Array<HTMLElement | null>>([]);
  /** Set on press; a drag past the threshold suppresses the click that follows. */
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // Decided once: hardware acceleration does not change at runtime.
  const [canvas] = useState(onCanvas);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Canvas mode: each face's drawn shape, the hovered face, and the colours. */
  const drawn = useRef<Drawn>([]);
  const hovered = useRef(-1);
  const palette = useRef<CubePalette | null>(null);

  // The sync loop: reads the camera orientation each frame and writes it to the cube and gnomon,
  // never through React state.
  useEffect(() => {
    let frame = 0;
    let written = '';
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const handle = handleRef.current;
      if (handle === null) return;

      // Write nothing while the camera is still. Setting a transform, even to the same value,
      // repaints and recomposites the 3D layers, which without a GPU costs the whole window
      // (`view-cube-canvas.ts`).
      const matrix = handle.viewCubeMatrix();
      const squared = handle.isOrthographic();
      const state = `${matrix.join(',')}|${String(squared)}|${hovered.current}|${palette.current === null}`;
      if (state === written) return;
      written = state;
      // Not React state: it is asked every frame, and a state update per frame is what this loop
      // avoids.
      rootRef.current?.classList.toggle('viewcube--squared', squared);

      const board = canvasRef.current;
      if (board !== null) {
        const context = board.getContext('2d');
        const root = rootRef.current;
        if (context === null || root === null) return;
        palette.current ??= readPalette(root);
        const perspective = Number.parseFloat(
          getComputedStyle(root).getPropertyValue('--cube-perspective'),
        );
        drawn.current = paintCube(
          context,
          matrix,
          perspective > 0 ? perspective : 320,
          palette.current,
          hovered.current,
          Math.min(devicePixelRatio, 2),
        );
        return;
      }

      const cube = cubeRef.current;
      if (cube === null) return;
      cube.style.transform = `translateZ(calc(var(--cube-half) * -1)) matrix3d(${matrix.join(',')})`;

      // Re-shade only faces whose lighting changed by at least one percent; a still camera writes
      // nothing.
      CUBE.forEach((face, index) => {
        const lit = Math.round(shadeOf(matrix, face.normal) * 100);
        if (shades.current[index] === lit) return;
        shades.current[index] = lit;
        faceRefs.current[index]?.style.setProperty('--face-fill', fillFor(lit));
      });

      // The letters face the viewer: the cube's rotation undone (its transpose), then moved out to
      // the arm's end. They stay in the cube's space, so the cube still occludes them.
      const m = matrix;
      const facing = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
      const turned = `matrix3d(${facing.join(',')})`;
      AXIS_PARTS.forEach((part) => {
        const label = labelRefs.current[part.axis];
        if (label === null || label === undefined) return;
        const [x, y, z] = part.labelAt;
        label.style.transform = `translate3d(${x}px, ${y}px, ${z}px) ${turned}`;
      });
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [handleRef]);

  // Drag to orbit, tracked on the window so a fast drag off the cube keeps going. In canvas mode
  // the pointer is also tracked here for hover: the canvas only takes the pointer over a face, so
  // the area around the cube still reaches the model.
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

  // In canvas mode, re-read the colours when the theme changes.
  useEffect(() => {
    if (!canvas) return;
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
  }, [canvas]);

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
        {canvas ? (
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
        ) : (
          <div
            className="viewcube__cube"
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, y: event.clientY, moved: false };
            }}
            ref={cubeRef}
          >
            {CORE.map((face) => (
              <span
                aria-hidden="true"
                className="viewcube__core"
                key={`core-${face.sides.join('-')}`}
                style={{
                  width: `${face.width}px`,
                  height: `${face.height}px`,
                  transform: face.transform,
                  clipPath: face.clipPath,
                }}
              />
            ))}
            {CUBE.map((face, index) =>
              face.kind === 'side' ? (
                <button
                  ref={(el) => {
                    faceRefs.current[index] = el;
                  }}
                  className="viewcube__face"
                  data-face={face.sides[0]}
                  key={face.sides.join('-')}
                  onPointerEnter={() => {
                    cubeHover.sides = face.sides;
                  }}
                  onPointerLeave={() => {
                    cubeHover.sides = null;
                  }}
                  onClick={() => {
                    if (drag.current?.moved === true) return;
                    pickFace(face, handleRef.current, animateRef.current, onSketchPlane, onPicked);
                  }}
                  style={styleOf(face)}
                  type="button"
                >
                  {labelOf(face)}
                </button>
              ) : (
                <button
                  ref={(el) => {
                    faceRefs.current[index] = el;
                  }}
                  aria-label={`View from ${face.sides.join(', ')}`}
                  className="viewcube__zone"
                  data-corner={face.kind === 'corner' ? '' : undefined}
                  data-zone={face.sides.join('-')}
                  key={face.sides.join('-')}
                  onPointerEnter={() => {
                    cubeHover.sides = face.sides;
                  }}
                  onPointerLeave={() => {
                    cubeHover.sides = null;
                  }}
                  onClick={() => {
                    if (drag.current?.moved === true) return;
                    pickFace(face, handleRef.current, animateRef.current, onSketchPlane, onPicked);
                  }}
                  style={styleOf(face)}
                  type="button"
                />
              ),
            )}

            {/* The axes, part of the solid rather than drawn over it. */}
            {AXIS_PARTS.flatMap((part) =>
              part.strips.map((strip) => (
                <span
                  aria-hidden="true"
                  className="viewcube__axis"
                  key={strip.transform}
                  style={{
                    width: `${strip.width}px`,
                    height: `${strip.height}px`,
                    margin: `${-strip.height / 2}px 0 0 ${-strip.width / 2}px`,
                    transform: strip.transform,
                    background: AXES[part.axis]?.colour,
                  }}
                />
              )),
            )}
            {AXIS_PARTS.map((part) => (
              <span
                aria-hidden="true"
                className="viewcube__axis-label"
                key={`${part.axis}-label`}
                ref={(el) => {
                  labelRefs.current[part.axis] = el;
                }}
                style={{ color: AXES[part.axis]?.colour }}
              >
                {AXES[part.axis]?.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
