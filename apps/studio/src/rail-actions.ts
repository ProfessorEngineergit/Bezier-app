/**
 * Rail commands that need more than a call: projecting a face's edges into a sketch, and starting
 * the move gizmo on the right target. Dispatched from `App.tsx`.
 */
import type { FeatureId, StableRef } from '@bezier/core';
import { isPlacedFeature } from './selection-kinds.js';
import type { Session, SessionView } from './session.js';

/** Project: draws the edges of the sketch's face into the sketch. */
export function projectFaceEdges(
  face: StableRef | null,
  session: Session | null,
  sketch: { project: (outline: NonNullable<Awaited<ReturnType<Session['faceOutline']>>>) => void },
  say: (message: string) => void,
): void {
  if (face === null || session === null) {
    say(
      'Project brings in the edges of the face a sketch is drawn on. Start the sketch on a face.',
    );
    return;
  }
  void session.faceOutline(face).then((outline) => {
    if (outline === null) say('The face this sketch is on could not be read.');
    else sketch.project(outline);
  });
}

/** Move/Rotate: toggles the gizmo on the selection, with a notice when nothing is selected. */
export function startMove({
  moveMode,
  setMoveMode,
  selectedRefs,
  mode,
  setSelectedFeature,
  view,
  selectedFeature,
  say,
}: {
  moveMode: boolean;
  setMoveMode: (on: boolean) => void;
  selectedRefs: readonly StableRef[];
  mode: { takeOfferedSketch: () => FeatureId | null };
  setSelectedFeature: (id: FeatureId | null) => void;
  view: SessionView | null;
  selectedFeature: FeatureId | null;
  say: (message: string) => void;
}): void {
  if (moveMode) {
    setMoveMode(false);
    return;
  }
  // A picked sketch region stands for its sketch, which then moves.
  const offered = selectedRefs.length === 0 ? mode.takeOfferedSketch() : null;
  if (offered !== null) {
    setSelectedFeature(offered);
    setMoveMode(true);
    return;
  }
  const placed = isPlacedFeature(view?.document, selectedFeature);
  // With several bodies, an empty selection must not mean "all".
  if (selectedRefs.length === 0 && !placed && (view?.bodies.length ?? 0) > 1) {
    say('Select the body to move first.');
    return;
  }
  // The gizmo needs a body; say so instead of showing it over nothing.
  if (!placed && (view?.display === null || view?.display === undefined)) {
    say('There is nothing to move yet.');
    return;
  }
  setMoveMode(true);
}
