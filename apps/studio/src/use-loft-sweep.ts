/**
 * The Loft, Sweep and Wrap commands (ADR 0017). Sketches picked in Items are used in pick order;
 * otherwise the latest fitting sketches are used (for a sweep, the latest with a closed region as
 * profile and the latest without as path). The panel can change either.
 */
import { type FeatureId, formatRef, type StableRef } from '@bezier/core';
import { useCallback } from 'react';
import type { Session, SessionView } from './session.js';
import { addOrExplain } from './use-geometry.js';

type Run = (change: (session: Session) => Promise<SessionView>) => void;

export function useLoftSweep(
  run: Run,
  view: SessionView | null,
  selectedFeature: FeatureId | null,
  selectedRefs: readonly StableRef[],
  say: (message: string) => void,
) {
  return useCallback(
    (command: 'loft' | 'sweep' | 'wrap') => {
      const sketches = (view?.document.features ?? []).filter((f) => f.type === 'sketch');
      const areas = (id: FeatureId) => view?.sketches.get(id)?.regions.length ?? 0;
      const closed = sketches.filter((f) => areas(f.id) === 1).map((f) => f.id);
      const open = sketches.filter((f) => areas(f.id) === 0).map((f) => f.id);
      let params: Record<string, unknown>;
      if (command === 'loft') {
        // The picked sketch first, then the latest other one.
        const order = [
          ...(selectedFeature !== null && closed.includes(selectedFeature)
            ? [selectedFeature]
            : []),
          ...closed.filter((id) => id !== selectedFeature).reverse(),
        ];
        const [from, to] = order.length >= 2 ? [order[1], order[0]] : [];
        if (from === undefined || to === undefined) {
          say('A loft goes between two sketches, each with one closed shape. Draw the second one.');
          return;
        }
        params = { from, to, ruled: false, operation: 'new' };
      } else if (command === 'wrap') {
        // Onto the picked cylindrical face, from the latest sketch with closed shapes (text, a
        // logo).
        const face = selectedRefs.find((ref) => ref.kind === 'face');
        const shapes = sketches.filter((f) => areas(f.id) > 0).map((f) => f.id);
        const from = shapes[shapes.length - 1];
        if (face === undefined || from === undefined) {
          say('Wrap lays a sketch round a round face: draw the text or shape, then pick the face.');
          return;
        }
        params = { sketch: from, faces: [formatRef(face)], height: 1 };
      } else {
        const profile = closed[closed.length - 1];
        const path = open[open.length - 1];
        if (profile === undefined || path === undefined) {
          say(
            'A sweep needs a sketch with a closed shape and a sketch with an open path to follow.',
          );
          return;
        }
        params = { profile, path, operation: 'new' };
      }
      const name = { loft: 'Loft', sweep: 'Sweep', wrap: 'Wrap' }[command];
      const id = `${command}-${String(Date.now())}`;
      void run((session) =>
        addOrExplain(session, say, id, name, {
          op: 'addFeature',
          id,
          type: command,
          name,
          index: session.document.features.length,
          params,
        }),
      );
    },
    [run, view, selectedFeature, selectedRefs, say],
  );
}
