/**
 * Optional title bar readout: one timing at a time as name, value and a 12-second trace, one line
 * tall in the bar's greys. Scroll, arrow keys or click switch between the three timings with a
 * roller animation (the two lines are faces of one bar rotating about its axis).
 */

import { useEffect, useRef, useState } from 'react';
import { PerformanceGesture } from './performance-gesture.js';
import { PerformancePlot } from './performance-plot.js';
import {
  observePerformance,
  PERFORMANCE_METRICS,
  PerformanceSamples,
} from './performance-sampler.js';

const COUNT = PERFORMANCE_METRICS.length;

/** Formats a value: whole frames per second, milliseconds to one decimal. */
function readable(index: number, value: number): string {
  return `${value.toFixed(index === 1 ? 0 : 1)} ${PERFORMANCE_METRICS[index]?.unit ?? ''}`;
}

export function PerformanceGraph() {
  const root = useRef<HTMLDivElement>(null);
  const samples = useRef(new PerformanceSamples());
  const [metric, setMetric] = useState(0);
  const [roll, setRoll] = useState<{ from: number; direction: number; id: number } | null>(null);
  const current = useRef(0);
  const rolling = useRef(false);
  const move = (direction: number) => {
    // One turn at a time; a second turn would have to start from a tilted bar.
    if (rolling.current) return;
    rolling.current = true;
    setRoll({ from: current.current, direction, id: performance.now() });
    current.current = (current.current + direction + COUNT) % COUNT;
    setMetric(current.current);
  };
  const moveRef = useRef(move);
  moveRef.current = move;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const gesture = new PerformanceGesture();
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 160 : 1;
      const delta = (event.deltaY || event.deltaX) * factor;
      const direction = gesture.wheel(performance.now(), delta, rolling.current);
      if (direction !== 0) moveRef.current(direction);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    const plots = new Map<HTMLElement, PerformancePlot>();
    let frame = 0;
    let previous = performance.now();
    const draw = (now: number) => {
      let moving = false;
      const elapsed = Math.min(50, now - previous);
      previous = now;
      for (const [face, plot] of plots) {
        if (!face.isConnected) plots.delete(face);
        else moving = plot.draw(elapsed) || moving;
      }
      frame = moving ? requestAnimationFrame(draw) : 0;
    };
    const stop = observePerformance((next) => {
      samples.current = next;
      // Written directly to the DOM: 4 samples a second do not warrant a React render.
      for (const face of el.querySelectorAll<HTMLElement>('[data-metric]')) {
        const index = Number(face.dataset.metric);
        const graph = next.graph(index);
        const plot = plots.get(face);
        if (plot) plot.update(graph.points, graph.count);
        else plots.set(face, new PerformancePlot(face, graph.points, graph.count));
        face.dataset.measuredValue = String(graph.value);
        const value = face.querySelector('.performance-graph__value');
        if (value) value.textContent = readable(index, graph.value);
      }
      if (frame === 0) {
        previous = performance.now();
        frame = requestAnimationFrame(draw);
      }
    });
    return () => {
      stop();
      cancelAnimationFrame(frame);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  const face = (index: number, className: string) => {
    const data = PERFORMANCE_METRICS[index] ?? PERFORMANCE_METRICS[0];
    const graph = samples.current.graph(index);
    return (
      <span
        className={`performance-graph__face ${className}`}
        data-metric={index}
        data-measured-value={graph.value}
        onAnimationEnd={
          className === 'performance-graph__in'
            ? () => {
                rolling.current = false;
                setRoll(null);
              }
            : undefined
        }
      >
        <span className="performance-graph__label">{data.name}</span>
        <span className="performance-graph__value">{readable(index, graph.value)}</span>
        <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 150 40">
          <path className="performance-graph__trace" d={graph.path} />
        </svg>
      </span>
    );
  };

  return (
    <div
      className="performance-graph"
      data-direction={roll?.direction === -1 ? 'back' : 'on'}
      ref={root}
    >
      <button
        aria-label={`Performance: ${PERFORMANCE_METRICS[metric]?.name}. Change graph`}
        className="performance-graph__button"
        onClick={() => move(1)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          move(event.key === 'ArrowDown' ? 1 : -1);
        }}
        type="button"
      >
        <span className="performance-graph__roller" key={roll?.id ?? 'still'}>
          {roll && face(roll.from, 'performance-graph__out')}
          {face(metric, roll ? 'performance-graph__in' : '')}
        </span>
      </button>
    </div>
  );
}
