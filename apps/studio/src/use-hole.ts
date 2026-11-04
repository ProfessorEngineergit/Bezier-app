/**
 * Commands that start from the picked face. Hole drills into the clicked flat face at the clicked
 * point, and Boss stands on it there; both are edited in the inspector. Thread cuts a thread in the
 * clicked round wall, with the pitch of the nearest ISO size. Lip follows the clicked rim, and Draft
 * tilts the picked walls.
 */

import { type FeatureId, formatRef, pitchFor, type StableRef, worldToPlane } from '@bezier/core';
import { type RefObject, useCallback } from 'react';
import type { Session, SessionView } from './session.js';

type Vec3 = { x: number; y: number; z: number };

/** What starts from the picked face or faces. */
export type FaceCommand = 'hole' | 'thread' | 'boss' | 'lip' | 'draft';
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
}): (kind: FaceCommand) => void {
  return useCallback(
    (kind) => {
      const faces = selectedRefs.filter((ref) => ref.kind === 'face');
      const [face] = faces;
      if (kind === 'draft') {
        if (faces.length === 0) {
          say('Click the walls to draft first; shift-click for more than one.');
          return;
        }
        const id = `draft-${String(Date.now())}`;
        void run(async (session) => {
          const tried = await session.tryApply(
            {
              op: 'addFeature',
              id,
              type: 'draft',
              name: 'Draft',
              index: session.document.features.length,
              params: {
                faces: faces.map(formatRef),
                angle: (2 * Math.PI) / 180,
                plane: 'XY',
              },
            },
            id,
          );
          if (tried.refused !== null) say(`Draft could not be made: ${tried.refused}`);
          else onCreated(id);
          return tried.view;
        });
        return;
      }
      if (face === undefined || faces.length !== 1) {
        say(
          kind === 'hole'
            ? 'Click the flat face to drill into first.'
            : kind === 'boss'
              ? 'Click the flat face the boss stands on first.'
              : kind === 'lip'
                ? 'Click the rim of a hollow part first.'
                : 'Click the round wall to thread first.',
        );
        return;
      }
      if (kind === 'lip') {
        const id = `lip-${String(Date.now())}`;
        void run(async (session) => {
          const tried = await session.tryApply(
            {
              op: 'addFeature',
              id,
              type: 'lip',
              name: 'Lip',
              index: session.document.features.length,
              params: {
                faces: [formatRef(face)],
                style: 'lip',
                width: 1,
                height: 2,
                clearance: 0.2,
              },
            },
            id,
          );
          if (tried.refused !== null) say(`Lip could not be made: ${tried.refused}`);
          else onCreated(id);
          return tried.view;
        });
        return;
      }
      if (kind === 'thread') {
        const id = `thread-${String(Date.now())}`;
        void run(async (session) => {
          const wall = await session.cylinderOn(face);
          if (wall === null) {
            say('A thread needs a complete round wall.');
            return session.rebuild();
          }
          const tried = await session.tryApply(
            {
              op: 'addFeature',
              id,
              type: 'thread',
              name: 'Thread',
              index: session.document.features.length,
              params: { faces: [formatRef(face)], pitch: pitchFor(wall.radius * 2, wall.inward) },
            },
            id,
          );
          if (tried.refused !== null) say(`Thread could not be created: ${tried.refused}`);
          else onCreated(id);
          return tried.view;
        });
        return;
      }
      const point = lastPoint.current;
      const id = `${kind}-${String(Date.now())}`;
      void run(async (session) => {
        const basis = await session.sketchBasisOn(face);
        if (basis === null) {
          say(kind === 'boss' ? 'A boss needs a flat face.' : 'A hole needs a flat face.');
          return session.rebuild();
        }
        const at = point === null ? { u: 0, v: 0 } : worldToPlane(basis, point);
        const round = (value: number) => Math.round(value * 100) / 100;
        const tried = await session.tryApply(
          {
            op: 'addFeature',
            id,
            type: kind,
            name: kind === 'boss' ? 'Boss' : 'Hole',
            index: session.document.features.length,
            params:
              kind === 'boss'
                ? {
                    faces: [formatRef(face)],
                    x: round(at.u),
                    y: round(at.v),
                    diameter: 8,
                    bore: 3,
                    height: 10,
                  }
                : {
                    faces: [formatRef(face)],
                    x: round(at.u),
                    y: round(at.v),
                    standard: 'custom',
                    fit: 'clearance',
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
        if (tried.refused !== null)
          say(`${kind === 'boss' ? 'Boss' : 'Hole'} could not be created: ${tried.refused}`);
        else onCreated(id);
        return tried.view;
      });
    },
    [run, selectedRefs, lastPoint, say, onCreated],
  );
}
