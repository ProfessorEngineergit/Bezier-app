import { LARGE_MODEL_FACES, LIGHTWEIGHT_TESSELLATION, type TessellationChoice } from '@bezier/core';
import { DEFAULT_TESSELLATION } from '@bezier/kernel';
import { type MutableRefObject, useEffect, useRef } from 'react';
import { type Detail, QUALITY_DEFLECTION, type Quality } from './preferences.js';
import type { Session, SessionDeps, SessionView } from './session.js';

/**
 * Finer angular tolerance for rendering: 16 facets are fine for modelling but show as kinks in a
 * smooth-shaded render. Three times the facets, and deflection no looser than 0.02 mm.
 */
const PRESENTING_ANGLE = 0.14;
const PRESENTING_DEFLECTION = 0.02;

/**
 * One object per setting, reused. The session reuses a cached drawing only for the identical
 * setting object, so fresh objects would force a full redraw when leaving Visualize.
 */
const CHOICES = new Map<string, TessellationChoice>();

/** The tessellation for a quality and detail preference. */
export function tessellationChoice(
  quality: Quality,
  detail: Detail,
  presenting = false,
): TessellationChoice {
  const key = `${quality}|${detail}|${presenting}`;
  const known = CHOICES.get(key);
  if (known !== undefined) return known;
  const made = makeChoice(quality, detail, presenting);
  CHOICES.set(key, made);
  return made;
}

function makeChoice(quality: Quality, detail: Detail, presenting: boolean): TessellationChoice {
  const full = presenting
    ? {
        linearDeflection: Math.min(QUALITY_DEFLECTION[quality], PRESENTING_DEFLECTION),
        angularDeflection: Math.min(DEFAULT_TESSELLATION.angularDeflection, PRESENTING_ANGLE),
      }
    : {
        linearDeflection: QUALITY_DEFLECTION[quality],
        angularDeflection: DEFAULT_TESSELLATION.angularDeflection,
      };
  if (detail === 'full') return full;
  if (detail === 'light') return LIGHTWEIGHT_TESSELLATION;
  return (faces) => (faces > LARGE_MODEL_FACES ? LIGHTWEIGHT_TESSELLATION : full);
}

// Quality is a display setting: it is written onto the deps the next rebuild reads, then the open
// model is rebuilt so the change applies immediately rather than to the next document.
//
// `ready` says whether the deps exist yet; without it this ran once before boot, found no deps and
// never ran again.
export function useQualityRebuild(
  depsRef: MutableRefObject<SessionDeps | null>,
  ready: boolean,
  { quality, detail }: { quality: Quality; detail: Detail },
  /** In Visualize, where the model is viewed rather than edited. */
  presenting: boolean,
  run: (change: (session: Session) => Promise<SessionView>) => Promise<void>,
) {
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const deps = depsRef.current;
    if (!ready || deps === null) return;
    const key = `${quality}|${detail}|${presenting}`;
    if (applied.current === key) return;
    const first = applied.current === null;
    applied.current = key;
    deps.tessellation = tessellationChoice(quality, detail, presenting);
    // Nothing is open at boot; the next project opened is built with this.
    if (!first) void run((session) => session.rebuild());
  }, [depsRef, ready, quality, detail, presenting, run]);
}
