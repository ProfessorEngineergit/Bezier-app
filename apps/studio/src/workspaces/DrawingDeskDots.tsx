/**
 * The desk background: a dot field in desk coordinates, so it pans and zooms with the sheets.
 * Static so it does not draw the eye. Painted only when the desk moves, resizes or changes theme;
 * a still desk costs nothing.
 */

import { type RefObject, useEffect, useRef } from 'react';

/** Dots this far apart on the desk, in desk units, at a zoom of one. */
const PITCH = 22;
/**
 * On-screen dot spacing. It doubles or halves to stay in a comfortable range (zoomed out the dots
 * would merge into grey, zoomed in none would be visible); each level shares dots with the
 * previous one.
 */
export function dotPitch(zoom: number): number {
  let pitch = PITCH * Math.max(zoom, 1e-6);
  while (pitch < 14) pitch *= 2;
  while (pitch > 56) pitch /= 2;
  return pitch;
}

export function DrawingDeskDots({
  camera,
  desk,
}: {
  camera: { x: number; y: number; zoom: number };
  desk: RefObject<HTMLDivElement | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = useRef<(() => void) | null>(null);
  const state = useRef({ camera, frame: 0 });
  state.current.camera = camera;

  useEffect(() => {
    const element = canvas.current;
    const room = desk.current;
    const ctx = element?.getContext('2d');
    if (!element || !room || !ctx) return;
    const s = state.current;

    const paint = () => {
      s.frame = 0;
      const width = room.clientWidth;
      const height = room.clientHeight;
      const ratio = Math.min(2, devicePixelRatio);
      if (
        element.width !== Math.round(width * ratio) ||
        element.height !== Math.round(height * ratio)
      ) {
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const target = s.camera;
      const pitch = dotPitch(target.zoom);
      const startX = (((target.x - pitch / 2) % pitch) + pitch) % pitch;
      const startY = (((target.y - pitch / 2) % pitch) + pitch) % pitch;
      ctx.fillStyle = getComputedStyle(room).getPropertyValue('--text').trim() || '#888';
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      for (let y = startY - pitch; y < height + pitch; y += pitch) {
        for (let x = startX - pitch; x < width + pitch; x += pitch) {
          ctx.moveTo(x + 1, y);
          ctx.arc(x, y, 1, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      // Field phase and spacing, for the browser tests.
      element.dataset.dotsX = startX.toFixed(2);
      element.dataset.dotsPitch = pitch.toFixed(3);
    };
    const wake = () => {
      if (s.frame === 0) s.frame = requestAnimationFrame(paint);
    };
    draw.current = wake;

    const observer = new ResizeObserver(wake);
    observer.observe(room);
    const theme = new MutationObserver(wake);
    theme.observe(document.documentElement, { attributes: true });
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', wake);
    wake();
    return () => {
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      observer.disconnect();
      theme.disconnect();
      scheme.removeEventListener('change', wake);
    };
  }, [desk]);

  // The camera moved: paint the field where the desk now is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a changed camera is the cue
  useEffect(() => {
    draw.current?.();
  }, [camera.x, camera.y, camera.zoom]);

  return (
    <div aria-hidden="true">
      <canvas className="dwg-dots" ref={canvas} />
    </div>
  );
}
