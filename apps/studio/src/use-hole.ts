/**
 * The Hole command: drills into the clicked flat face at the clicked point; edited in the
 * inspector.
 */

import { type FeatureId, formatRef, type StableRef, worldToPlane } from '@bezier/core';
import { type RefObject, useCallback } from 'react';
import type { Session, SessionView } from './session.js';

type Vec3 = { x: number; y: number; z: number };
type Run = (change: (session: Session) => Promise<SessionView>) => Promise<void> | void;

export function useHole({
  run,
  selectedRefs,
  lastPoint,
  say,
  onCreated,
}: {
  run: Run;
  selectedRefs: readonly StableRef[];
  /** Where the last click hit the model, if it did. */
  lastPoint: RefObject<Vec3 | null>;
  say: (message: string) => void;
  onCreated: (id: FeatureId) => void;
}): () => void {
  return useCallback(() => {
    const faces = selectedRefs.filter((ref) => ref.kind === 'face');
    const [face] = faces;
    if (face === undefined || faces.length !== 1) {
      say('Click the flat face to drill into first.');
      return;
    }
    const point = lastPoint.current;
    const id = `hole-${String(Date.now())}`;
    void run(async (session) => {
      const basis = await session.sketchBasisOn(face);
      if (basis === null) {
        say('A hole needs a flat face.');
        return session.rebuild();
      }
      const at = point === null ? { u: 0, v: 0 } : worldToPlane(basis, point);
      const round = (value: number) => Math.round(value * 100) / 100;
      const tried = await session.tryApply(
        {
          op: 'addFeature',
          id,
          type: 'hole',
          name: 'Hole',
          index: session.document.features.length,
          params: {
            faces: [formatRef(face)],
            x: round(at.u),
            y: round(at.v),
            diameter: 5,
            through: true,
            depth: 10,
            style: 'simple',
            headDiameter: 9,
            headDepth: 3,
            sinkAngle: 90,
          },
        },
        id,
      );
      if (tried.refused !== null) say(`Hole could not be created: ${tried.refused}`);
      else onCreated(id);
      return tried.view;
    });
  }, [run, selectedRefs, lastPoint, say, onCreated]);
}
