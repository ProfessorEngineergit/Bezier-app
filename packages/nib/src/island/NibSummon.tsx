/**
 * Nib while idle: a thin strip at the top of the window. Hovering there briefly brings out his
 * head and shoulders; pressing opens his menu (lessons, help, settings). The delay is long enough
 * that a pointer crossing the title bar does not trigger it.
 */

import { useEffect, useRef, useState } from 'react';
import { type HeadState, NibHead } from '../NibHead.js';
import type { NibLook } from '../stage.js';
import { FACES } from './face.js';
import { NibFace } from './NibFace.js';

/** Hover time at the top before he appears, in milliseconds. */
export const SUMMON_AFTER_MS = 650;
/** How long he stays after the pointer leaves. */
const STAY_MS = 900;

export interface NibSummonProps {
  onSummon: () => void;
  label: string;
  model: string;
  still: boolean;
  look?: NibLook;
}

export function NibSummon({ onSummon, label, model, still, look }: NibSummonProps) {
  const [out, setOut] = useState(false);
  // His stage (WebGL context and model) is created the first time he appears.
  const [wanted, setWanted] = useState(false);
  const [head, setHead] = useState<HeadState>('loading');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (out) setWanted(true);
  }, [out]);
  const later = (next: boolean, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOut(next), ms);
  };
  return (
    <div
      className="nib-summon"
      data-out={out ? '' : undefined}
      onPointerEnter={() => later(true, out ? 0 : SUMMON_AFTER_MS)}
      onPointerLeave={() => later(false, STAY_MS)}
    >
      <button
        aria-label={label}
        className="nib-summon__tab"
        onBlur={() => later(false, STAY_MS)}
        onClick={() => {
          clearTimeout(timer.current);
          setOut(false);
          onSummon();
        }}
        // Keyboard focus also brings him out, since there is no hover.
        onFocus={() => later(true, 0)}
        type="button"
      >
        <span className="nib-summon__bust" data-head={head}>
          <NibFace face={FACES.rest} />
          {wanted && (
            <NibHead
              active={out}
              model={model}
              mood="rest"
              onState={setHead}
              still={still}
              {...(look === undefined ? {} : { look })}
            />
          )}
        </span>
      </button>
    </div>
  );
}
