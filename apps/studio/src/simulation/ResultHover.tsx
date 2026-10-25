/** Imperative hover readout: pointer motion updates the scale without rerendering React. */
import { type RefObject, useEffect, useRef } from 'react';
import type { ViewportHandle } from '../Viewport.js';
export function ResultHover({
  handleRef,
  min,
  max,
  unit,
}: {
  handleRef: RefObject<ViewportHandle | null>;
  min: number;
  max: number;
  unit: string;
}) {
  const marker = useRef<HTMLDivElement>(null),
    output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const node = marker.current,
      label = output.current;
    const canvas = node?.closest('.stage')?.querySelector('canvas.viewport');
    if (!node || !label || !(canvas instanceof HTMLCanvasElement)) return;
    const clear = () => {
      node.dataset.active = 'false';
      label.textContent = 'Hover the model';
    };
    const move = (event: PointerEvent) => {
      if (event.buttons !== 0) {
        clear();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const value =
        handleRef.current?.sampleResult(event.clientX - rect.left, event.clientY - rect.top) ??
        null;
      if (value === null) {
        clear();
        return;
      }
      const ratio = Math.max(0, Math.min(1, (value - min) / Math.max(1e-12, max - min)));
      node.style.top = `${(1 - ratio) * 100}%`;
      node.dataset.active = 'true';
      node.dataset.value = String(value);
      label.textContent = `${Number(value.toPrecision(3))}${unit ? ` ${unit}` : ''}`;
    };
    clear();
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', clear);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', clear);
    };
  }, [handleRef, min, max, unit]);
  return (
    <>
      <div ref={marker} className="sim-legend__marker" aria-hidden="true" />
      <output ref={output} className="sim-legend__hover" aria-label="Result at cursor">
        Hover the model
      </output>
    </>
  );
}
