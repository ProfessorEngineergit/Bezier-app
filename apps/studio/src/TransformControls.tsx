import type { FeatureRecord, StableRef } from '@bezier/core';
import type { RefObject } from 'react';
import { ImageTransform } from './ImageTransform.js';
import { SketchTransform } from './SketchTransform.js';
import type { Session, SessionView } from './session.js';
import { TransformTool } from './TransformTool.js';
import type { ViewportHandle } from './Viewport.js';

export function TransformControls({
  sketch,
  picture,
  onPatch,
  view,
  selectedRefs,
  handleRef,
  sessionRef,
  run,
  setView,
  onClose,
  onSelectionChange,
  onMoved,
  say,
}: {
  sketch: FeatureRecord | undefined;
  /** A selected reference image; it moves with the same gizmo. */
  picture: FeatureRecord | undefined;
  onPatch: (id: string, params: Record<string, unknown>) => void;
  view: SessionView | null;
  selectedRefs: readonly StableRef[];
  handleRef: RefObject<ViewportHandle | null>;
  sessionRef: RefObject<Session | null>;
  run: (change: (session: Session) => Promise<SessionView>) => void;
  setView: (view: SessionView) => void;
  onClose: () => void;
  onSelectionChange: (refs: readonly StableRef[]) => void;
  onMoved: (face: StableRef) => void;
  say?: (message: string) => void;
}) {
  if (picture !== undefined)
    return (
      <ImageTransform
        view={view}
        feature={picture}
        handleRef={handleRef}
        key={picture.id}
        onClose={onClose}
        onPatch={onPatch}
        run={run}
      />
    );
  const basis = sketch === undefined ? undefined : view?.sketches.get(sketch.id)?.basis;
  // A broken sketch must never silently turn this into a body transformation.
  if (sketch !== undefined && basis === undefined) return null;
  if (sketch !== undefined && basis !== undefined)
    return (
      <SketchTransform
        key={sketch.id}
        feature={sketch}
        basis={basis}
        view={view}
        handleRef={handleRef}
        sessionRef={sessionRef}
        run={run}
        setView={setView}
        onClose={onClose}
      />
    );
  return (
    <TransformTool
      view={view}
      selectedRefs={selectedRefs}
      onSelectionChange={onSelectionChange}
      onClose={onClose}
      handleRef={handleRef}
      sessionRef={sessionRef}
      run={run}
      setView={setView}
      onMoved={onMoved}
      {...(say === undefined ? {} : { say })}
    />
  );
}
