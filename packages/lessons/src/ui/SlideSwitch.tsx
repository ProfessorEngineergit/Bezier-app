/**
 * A segmented control with a sliding thumb. Stops can be pressed like buttons, or the thumb can be
 * dragged and settles on the nearest stop.
 */

import '../home/level-switch.css';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';

/** The stop under a pointer at `fraction` of the track width. */
export function stopAt(fraction: number, stops: number): number {
  return Math.min(stops - 1, Math.max(0, Math.floor(fraction * stops)));
}

export function SlideSwitch<Choice extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  /** Accessible label for the group. */
  label: string;
  choices: readonly { value: Choice; label: string }[];
  value: Choice;
  onChange: (next: Choice) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  /** The thumb position while held, in unrounded stops. */
  const [held, setHeld] = useState<number | null>(null);
  const index = choices.findIndex((choice) => choice.value === value);
  const last = choices.length - 1;

  const fractionOf = (event: ReactPointerEvent) => {
    const box = track.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return 0;
    return (event.clientX - box.left) / box.width;
  };
  const choose = (at: number) => {
    const next = choices[at];
    if (next !== undefined && next.value !== value) onChange(next.value);
  };
  const follow = (event: ReactPointerEvent) => {
    const at = fractionOf(event) * choices.length - 0.5;
    setHeld(Math.min(last, Math.max(0, at)));
    choose(stopAt(fractionOf(event), choices.length));
  };

  return (
    <div
      aria-label={label}
      className="lessons-level"
      data-held={held === null ? undefined : ''}
      onKeyDown={(event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        // Handle left and right here; up and down stay with the page.
        event.stopPropagation();
        choose(Math.min(last, Math.max(0, index + step)));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        follow(event);
      }}
      onPointerMove={(event) => {
        if (held !== null) follow(event);
      }}
      onPointerUp={() => setHeld(null)}
      onPointerCancel={() => setHeld(null)}
      ref={track}
      role="radiogroup"
      style={{ '--stops': choices.length, '--at': held ?? index } as CSSProperties}
    >
      <span aria-hidden="true" className="lessons-level__thumb" />
      {choices.map((choice, at) => (
        // biome-ignore lint/a11y/useSemanticElements: native radios cannot share one sliding thumb
        <button
          aria-checked={choice.value === value}
          className="lessons-level__stop"
          key={choice.value}
          onClick={() => choose(at)}
          role="radio"
          tabIndex={choice.value === value ? 0 : -1}
          type="button"
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
