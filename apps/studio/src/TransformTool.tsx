/** Previews and commits transforms through the same journal operation and world pivot. */
import { formatRef, type StableRef } from '@bezier/core';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { MoveGizmo } from './MoveGizmo.js';
import { moveTarget } from './move-selection.js';
import type { Session, SessionView } from './session.js';
import { useMoveSnap } from './use-move-snap.js';
import type { ViewportHandle } from './Viewport.js';

type Point = { x: number; y: number; z: number };
export type TransformEdit =
  | { kind: 'move'; delta: Point }
  | { kind: 'rotate'; axis: 'x' | 'y' | 'z'; angle: number; origin: Point };

/** The move or rotation as a column-major 4 × 4 matrix, as the renderer takes it. */
export function matrixOf(edit: TransformEdit): number[] {
  if (edit.kind === 'move') {
    const { x, y, z } = edit.delta;
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  }
  const c = Math.cos(edit.angle);
  const s = Math.sin(edit.angle);
  // Rotation about the axis through `origin`: the rotation rows, then the origin's translation.
  const r =
    edit.axis === 'x'
      ? [1, 0, 0, 0, c, -s, 0, s, c]
      : edit.axis === 'y'
        ? [c, 0, s, 0, 1, 0, -s, 0, c]
        : [c, -s, 0, s, c, 0, 0, 0, 1];
  const [a = 0, b = 0, d = 0, e = 0, f = 0, g = 0, h = 0, i = 0, j = 0] = r;
  const { x, y, z } = edit.origin;
  const tx = x - (a * x + b * y + d * z);
  const ty = y - (e * x + f * y + g * z);
  const tz = z - (h * x + i * y + j * z);
  return [a, e, h, 0, b, f, i, 0, d, g, j, 0, tx, ty, tz, 1];
}

export function TransformTool({
  handleRef,
  sessionRef,
  run,
  setView,
  onClose,
  selectedRefs,
  onSelectionChange,
  onMoved,
  say,
  view,
}: {
  /** The displayed model, for move snapping. */
  view: SessionView | null;
  handleRef: RefObject<ViewportHandle | null>;
  sessionRef: RefObject<Session | null>;
  run: (change: (session: Session) => Promise<SessionView>) => void;
  setView: (view: SessionView) => void;
  onClose: () => void;
  selectedRefs: readonly StableRef[];
  onSelectionChange: (refs: readonly StableRef[]) => void;
  /** Called after a move is committed, so contact with another body can be asked about. */
  onMoved?: (face: StableRef) => void;
  /** Explains why a face or edge could not be moved. */
  say?: (message: string) => void;
}) {
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const snapTo = useMoveSnap({
    handleRef,
    display: view?.display ?? null,
    bodies: view?.bodies ?? [],
    selected: selectedRefs,
  });
  // Faces and edges picked on their own move by themselves, with the adjacent faces following.
  const target = moveTarget(view?.bodies ?? [], selectedRefs);
  const parts = target.kind === 'parts';
  // Whole bodies are dragged as a preview (`showMovedPreview`): their faces are lifted out once and
  // moved by a matrix each step. The kernel builds the move once, on release.
  const bodies = view?.bodies ?? [];
  const picked = new Set(selectedRefs.filter((ref) => ref.kind === 'face').map(formatRef));
  const owners =
    picked.size === 0
      ? bodies
      : bodies.filter((body) => body.faces.some((face) => picked.has(formatRef(face))));
  const moving = owners.flatMap((body) => body.faces);
  // When everything moves, the step records "all" instead of every face name (107,000 for the
  // Voron, written to the journal and resolved on each rebuild), and the kernel moves the model
  // whole instead of splitting it first.
  const everything = bodies.length > 0 && owners.length === bodies.length;
  const facesOf = () =>
    everything ? [] : selectedRefs.filter((ref) => ref.kind === 'face').map(formatRef);
  const locked = useRef(false);
  const inPreview = useRef(false);
  const [initialPivot] = useState(() => {
    const points = selectedRefs
      .map((ref) => handleRef.current?.faceCentroid(ref))
      .filter((p): p is Point => p != null);
    if (!points.length) return null;
    return points.reduce(
      (sum, p) => ({
        x: sum.x + p.x / points.length,
        y: sum.y + p.y / points.length,
        z: sum.z + p.z / points.length,
      }),
      { x: 0, y: 0, z: 0 },
    );
  });
  const id = useRef<string | null>(null);
  const generation = useRef(0);
  const waiting = useRef<TransformEdit | null>(null);
  const running = useRef(false);
  const operation = (session: Session, edit: TransformEdit) => {
    id.current ??= `${edit.kind}-${crypto.randomUUID()}`;
    if (parts && target.kind === 'parts') {
      const what = target.faces.length > 0 ? 'face' : target.edges.length > 0 ? 'edge' : 'corner';
      return {
        op: 'addFeature' as const,
        id: id.current,
        type: 'move-parts',
        name: `${edit.kind === 'move' ? 'Move' : 'Turn'} ${what}`,
        index: session.document.features.length,
        params: {
          faces: target.faces.map(formatRef),
          edges: target.edges.map(formatRef),
          vertices: target.vertices.map(formatRef),
          ...(edit.kind === 'move'
            ? { dx: edit.delta.x, dy: edit.delta.y, dz: edit.delta.z }
            : {
                axis: edit.axis,
                angle: edit.angle,
                ox: edit.origin.x,
                oy: edit.origin.y,
                oz: edit.origin.z,
              }),
        },
      };
    }
    return {
      op: 'addFeature' as const,
      id: id.current,
      type: copy ? 'transform-copy' : edit.kind,
      name: copy ? 'Copy' : edit.kind === 'move' ? 'Move' : 'Rotate',
      index: session.document.features.length,
      params:
        edit.kind === 'move'
          ? {
              dx: edit.delta.x,
              dy: edit.delta.y,
              dz: edit.delta.z,
              faces: facesOf(),
            }
          : {
              faces: facesOf(),
              axis: edit.axis,
              angle: edit.angle,
              ox: edit.origin.x,
              oy: edit.origin.y,
              oz: edit.origin.z,
            },
    };
  };
  useEffect(
    () => () => {
      generation.current++;
      waiting.current = null;
      handleRef.current?.showMovedPreview([], null);
      if (inPreview.current) void sessionRef.current?.cancelPreview().then(setView);
    },
    [sessionRef, setView, handleRef],
  );
  const preview = async (edit: TransformEdit) => {
    if (locked.current) return;
    if (!parts) {
      handleRef.current?.showMovedPreview(moving, matrixOf(edit), copy);
      return;
    }
    inPreview.current = true;
    waiting.current = edit;
    if (running.current) return;
    running.current = true;
    const version = generation.current;
    try {
      while (waiting.current !== null && version === generation.current) {
        const next = waiting.current;
        waiting.current = null;
        const session = sessionRef.current;
        if (!session) break;
        const view = await session.previewApply(operation(session, next));
        if (view && version === generation.current) setView(view);
      }
    } finally {
      running.current = false;
      if (waiting.current) void previewRef.current(waiting.current);
    }
  };
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const finish = (edit: TransformEdit | null) => {
    if (locked.current) return;
    // Cancelled with nothing previewed in the kernel (a whole body dragged as a preview): only the
    // preview needs clearing. Reverting through the session rebuilt the model, which took seconds
    // on the Voron assembly.
    if (edit === null && !inPreview.current) {
      generation.current++;
      waiting.current = null;
      handleRef.current?.showMovedPreview([], null);
      return;
    }
    locked.current = true;
    inPreview.current = false;
    setBusy(true);
    generation.current++;
    waiting.current = null;
    run(async (session) => {
      const change = edit === null ? null : operation(session, edit);
      id.current = null;
      try {
        // A face or edge that cannot follow is not recorded broken; the user is told why.
        const tried = parts && change !== null ? await session.tryApply(change, change.id) : null;
        if (tried?.refused != null) say?.(tried.refused);
        // A body dragged as a preview stays at the release point until the model is drawn there;
        // if cancelled, it reverts now.
        if (change === null) handleRef.current?.showMovedPreview([], null);
        const next =
          tried !== null
            ? tried.view
            : await (change === null ? session.cancelPreview() : session.apply(change));
        if (change && next.statuses.get(change.id)?.state === 'ok') {
          const copied = copy
            ? (next.display?.faceRefs ?? []).filter(
                (ref): ref is StableRef => ref?.kind === 'face' && ref.feature === change.id,
              )
            : [];
          if (copied.length) onSelectionChange(copied);
          const moved = copied[0] ?? selectedRefs.find((ref) => ref.kind === 'face');
          if (moved !== undefined && !parts) onMoved?.(moved);
        }
        return next;
      } finally {
        locked.current = false;
        setBusy(false);
      }
    });
  };
  return (
    <MoveGizmo
      handleRef={handleRef}
      initialPivot={initialPivot}
      busy={busy}
      copy={copy && !parts}
      onCopyChange={setCopy}
      copyable={!parts}
      onClose={() => {
        finish(null);
        onClose();
      }}
      onCommit={(delta) => finish({ kind: 'move', delta })}
      onRotate={(axis, angle, origin) => finish({ kind: 'rotate', axis, angle, origin })}
      onPreview={(edit) => {
        void preview(edit);
      }}
      onCancel={() => finish(null)}
      snapTo={snapTo}
    />
  );
}
