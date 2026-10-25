import { clock, clockFine } from '../format/clock.js';

/** Candidate label intervals in seconds; the first that fits `LABEL_ROOM` is used. */
const STEPS = [0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];

/** Minimum pixels between labels. */
const LABEL_ROOM = 64;

export function rulerStep(pixelsPerSecond: number): number {
  return STEPS.find((step) => step * pixelsPerSecond >= LABEL_ROOM) ?? 600;
}

interface Props {
  length: number;
  pixelsPerSecond: number;
}

/** The time ruler above the timeline, labelled every step with minor ticks between. */
export function Ruler({ length, pixelsPerSecond }: Props) {
  const step = rulerStep(pixelsPerSecond);
  const minor = step / 5;
  const fine = step < 1;
  const ticks: { at: number; major: boolean }[] = [];
  for (let n = 0; n * minor <= length + 0.0001; n += 1) {
    ticks.push({ at: n * minor, major: n % 5 === 0 });
  }
  return (
    <div aria-hidden="true" className="lessons-ruler">
      {ticks.map((tick) => (
        <span
          className="lessons-ruler__tick"
          data-major={tick.major ? '' : undefined}
          key={tick.at}
          style={{ left: tick.at * pixelsPerSecond }}
        >
          {tick.major && (fine ? clockFine(tick.at) : clock(tick.at))}
        </span>
      ))}
    </div>
  );
}
