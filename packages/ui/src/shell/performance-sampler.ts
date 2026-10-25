/** Browser timings, not invented CPU/GPU utilisation. Sampling stops with the optional widget. */
import { performancePath } from './performance-plot.js';

export const PERFORMANCE_METRICS = [
  { name: 'Frame time', unit: 'ms', ceiling: 64 },
  { name: 'Frame cadence', unit: 'fps', ceiling: 70 },
  { name: 'Main-thread delay', unit: 'ms', ceiling: 100 },
] as const;
export class PerformanceSamples {
  readonly series = PERFORMANCE_METRICS.map(() => new Float32Array(48));
  at = 0;
  count = 0;
  frames = 0;
  longest = 0;
  delay = 0;
  previous = 0;
  sampledAt = 0;
  frame(now: number) {
    if (this.previous > 0) {
      this.longest = Math.max(this.longest, now - this.previous);
      this.frames++;
    }
    this.previous = now;
  }
  sample(now: number) {
    const elapsed = now - this.sampledAt;
    if (this.sampledAt === 0 || elapsed <= 0) {
      this.sampledAt = now;
      return;
    }
    // A delayed timer can run before the first resumed animation frame. Capture the
    // unfinished gap now rather than waiting for rAF and losing the stalled interval.
    const gap = this.previous > 0 ? now - this.previous : 0;
    const values = [Math.max(this.longest, gap), (1000 * this.frames) / elapsed, this.delay];
    this.series.forEach((row, i) => {
      row[this.at] = values[i] ?? 0;
    });
    this.at = (this.at + 1) % 48;
    this.count = Math.min(48, this.count + 1);
    this.frames = 0;
    this.longest = 0;
    this.delay = 0;
    this.sampledAt = now;
  }
  graph(index: number) {
    const row = this.series[index];
    const values = Array.from(
      { length: this.count },
      (_, i) => row?.[(this.at - this.count + i + 48) % 48] ?? 0,
    );
    const ceiling = PERFORMANCE_METRICS[index]?.ceiling ?? 100;
    const maximum = Math.max(ceiling, ...values);
    const max =
      index === 1 && maximum <= 70 ? 70 : ceiling * 2 ** Math.ceil(Math.log2(maximum / ceiling));
    const min = index === 1 && max === 70 ? 20 : 0;
    const ordinate = (value: number) =>
      36 - 32 * Math.min(1, Math.max(0, (value - min) / (max - min)));
    const points = new Float32Array(48).fill(ordinate(0));
    values.forEach((value, i) => {
      points[48 - this.count + i] = ordinate(value);
    });
    const markers =
      index === 1 && max === 70 ? [30, 40, 50, 60] : [max / 4, max / 2, (max * 3) / 4, max];
    return {
      path: performancePath(points, this.count),
      points,
      count: this.count,
      ticks: markers.map((value) => ({ value, y: ordinate(value) })),
      y: points[47] ?? 36,
      value: values.at(-1) ?? 0,
    };
  }
}
export function observePerformance(onSample: (samples: PerformanceSamples) => void): () => void {
  const samples = new PerformanceSamples();
  let raf = 0;
  let due = performance.now() + 50;
  const frame = (now: number) => {
    samples.frame(now);
    raf = requestAnimationFrame(frame);
  };
  const start = () => {
    samples.previous = 0;
    samples.sampledAt = performance.now();
    due = performance.now() + 50;
    raf = requestAnimationFrame(frame);
  };
  start();
  const timer = window.setInterval(() => {
    if (document.hidden) return;
    const now = performance.now();
    samples.delay = Math.max(samples.delay, Math.max(0, now - due));
    due = now + 50;
    if (now - samples.sampledAt >= 250) {
      samples.sample(now);
      onSample(samples);
    }
  }, 50);
  const visibility = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) start();
  };
  document.addEventListener('visibilitychange', visibility);
  return () => {
    cancelAnimationFrame(raf);
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visibility);
  };
}
