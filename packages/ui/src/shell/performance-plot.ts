/** Smooth measured samples in screen space; never manufacture activity or random noise. */
export function performancePath(points: Float32Array, count: number): string {
  const first = 48 - count;
  let path = '';
  for (let i = first; i < 48; i++) {
    const x = 8 + i * 2.8;
    const y = points[i] ?? 26;
    if (i === first) path = `M${x.toFixed(1)},${y.toFixed(2)}`;
    else {
      const mid = x - 1.4;
      path += `C${mid.toFixed(1)},${(points[i - 1] ?? 26).toFixed(2)} ${mid.toFixed(1)},${y.toFixed(2)} ${x.toFixed(1)},${y.toFixed(2)}`;
    }
  }
  return path;
}

export class PerformancePlot {
  readonly current: Float32Array;
  readonly target: Float32Array;
  readonly path: SVGPathElement | null;
  count: number;

  constructor(
    readonly face: HTMLElement,
    points: Float32Array,
    count: number,
  ) {
    this.current = points.slice();
    this.target = points.slice();
    this.count = count;
    this.path = face.querySelector('path');
  }

  update(points: Float32Array, count: number) {
    this.target.set(points);
    this.count = count;
  }

  draw(elapsed: number): boolean {
    const blend = 1 - Math.exp(-elapsed / 65);
    let moving = false;
    for (let i = 0; i < 48; i++) {
      const goal = this.target[i] ?? 26;
      const value = this.current[i] ?? goal;
      moving ||= Math.abs(goal - value) > 0.025;
      this.current[i] = Math.abs(goal - value) < 0.025 ? goal : value + (goal - value) * blend;
    }
    this.path?.setAttribute('d', performancePath(this.current, this.count));
    return moving;
  }
}
