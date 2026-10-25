/**
 * Whole-body actions: hide, name, remove, duplicate, split, scale, combine, and contact handling.
 * All are ordinary journal steps that undo like any edit (ADR 0009). Remove, Combine, Split, Scale
 * and Duplicate are history features; visibility and names are document state (ADR 0012). Tools add
 * a feature only if it builds (`Session.tryApply`).
 */

import {
  type BodySummary,
  type FeatureId,
  formatRef,
  type Operation,
  type StableRef,
} from '@bezier/core';
import type { DisplayGeometry } from '@bezier/renderer';
import { type RefObject, useCallback, useMemo, useRef, useState } from 'react';
import type { ItemsPanelProps } from './ItemsPanel.js';
import type { BodyContact, Session, SessionView } from './session.js';
import { useHistoryOrder } from './use-history-order.js';

type Run = (change: (session: Session) => Promise<SessionView>) => void;

interface BodiesDeps {
  run: Run;
  view: SessionView | null;
  sessionRef: RefObject<Session | null>;
  selectedRefs: readonly StableRef[];
  setSelectedRefs: (refs: readonly StableRef[]) => void;
  /** The history step the inspector shows: cleared when a body is picked, set for a new tool. */
  setSelectedFeature: (id: FeatureId | null) => void;
  say: (msg: string) => void;
}

const NO_BODIES: readonly BodySummary[] = [];

/** Above this many bodies, contacts are not checked after a move or new part. */
const CONTACT_BODIES = 50;

/** The body a face belongs to. */
function bodyOf(bodies: readonly BodySummary[], face: StableRef | undefined): BodySummary | null {
  if (face === undefined) return null;
  const key = formatRef(face);
  return bodies.find((body) => body.faces.some((ref) => formatRef(ref) === key)) ?? null;
}

/** Any face of the body; a body is identified by the solid that owns it. */
function handleOf(body: BodySummary): string | null {
  const face = body.faces.find((ref) => ref.kind === 'face');
  return face === undefined ? null : formatRef(face);
}

/**
 * The bodies a selection touches, in pick order: Combine keeps the first and joins or cuts the
 * others.
 */
export function bodiesPicked(
  bodies: readonly BodySummary[],
  selected: readonly StableRef[],
): readonly BodySummary[] {
  const owner = new Map<string, BodySummary>();
  for (const body of bodies) for (const face of body.faces) owner.set(formatRef(face), body);
  const picked: BodySummary[] = [];
  for (const ref of selected) {
    const faces = ref.kind === 'face' ? [ref] : ref.faces;
    for (const face of faces) {
      const body = owner.get(formatRef(face));
      if (body !== undefined && !picked.includes(body)) picked.push(body);
    }
  }
  return picked;
}

/**
 * The selection after a marquee drag: what it covered (whole bodies with the Bodies filter), added
 * to or replacing the previous selection.
 */
export function areaPicked(
  filter: string,
  bodies: readonly BodySummary[],
  selected: readonly StableRef[],
  faces: readonly StableRef[],
  additive: boolean,
): StableRef[] {
  const taken =
    filter === 'bodies' ? bodiesPicked(bodies, faces).flatMap((body) => body.faces) : faces;
  const base = additive ? selected : [];
  const known = new Set(base.map(formatRef));
  return [...base, ...taken.filter((ref) => !known.has(formatRef(ref)))];
}

/**
 * World bounding box of some displayed faces, from the mesh. Only used for placement (a duplicate
 * beside its original, a split through the middle), where tessellation error does not matter.
 */
export function boundsOf(
  display: DisplayGeometry | null,
  faces: readonly StableRef[],
): { min: [number, number, number]; max: [number, number, number] } | null {
  if (display === null) return null;
  const wanted = new Set(faces.map(formatRef));
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const { positions, indices, triangleFaces } = display.mesh;
  for (let t = 0; t < triangleFaces.length; t++) {
    const ref = display.faceRefs[triangleFaces[t] ?? 0];
    if (ref == null || !wanted.has(formatRef(ref))) continue;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = (indices[t * 3 + corner] ?? 0) * 3;
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[vertex + axis] ?? 0;
        min[axis] = Math.min(min[axis] ?? value, value);
        max[axis] = Math.max(max[axis] ?? value, value);
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

export function useBodies({
  run,
  view,
  sessionRef,
  selectedRefs,
  setSelectedRefs,
  setSelectedFeature,
  say,
}: BodiesDeps) {
  const bodies = view?.bodies ?? NO_BODIES;
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;
  /** Bodies in contact after the last edit, awaiting an answer. */
  const [contacts, setContacts] = useState<readonly BodyContact[]>([]);
  /** The face the question is about; the menu is placed at it. */
  const [contactFace, setContactFace] = useState<StableRef | null>(null);

  /** Adds one feature if it builds, otherwise says why. Selects it for its panel. */
  const addTool = useCallback(
    (operation: Extract<Operation, { op: 'addFeature' }>, inspect: boolean) => {
      void run(async (session) => {
        const tried = await session.tryApply(
          { ...operation, index: session.document.features.length },
          operation.id,
        );
        if (tried.refused !== null) say(`${operation.name} could not be applied: ${tried.refused}`);
        else if (inspect) setSelectedFeature(operation.id);
        return tried.view;
      });
    },
    [run, say, setSelectedFeature],
  );

  /** Picks a body from the list; with a modifier, toggles it in the selection. */
  const selectBody = useCallback(
    (key: string, additive: boolean) => {
      const body = bodies.find((candidate) => candidate.key === key);
      if (body === undefined || body.hidden) return;
      setSelectedFeature(null);
      if (!additive) {
        setSelectedRefs(body.faces);
        return;
      }
      const faces = new Set(body.faces.map(formatRef));
      const touched = selectedRefs.some((ref) => faces.has(formatRef(ref)));
      setSelectedRefs(
        touched
          ? selectedRefs.filter((ref) => !faces.has(formatRef(ref)))
          : [...selectedRefs, ...body.faces],
      );
    },
    [bodies, selectedRefs, setSelectedRefs, setSelectedFeature],
  );

  /** Picks several bodies at once (a folder's); added to the selection when `additive`. */
  const selectBodies = useCallback(
    (keys: readonly string[], additive: boolean) => {
      const faces = bodies
        .filter((body) => keys.includes(body.key) && !body.hidden)
        .flatMap((body) => body.faces);
      setSelectedFeature(null);
      setSelectedRefs(additive ? [...selectedRefs, ...faces] : faces);
    },
    [bodies, selectedRefs, setSelectedRefs, setSelectedFeature],
  );

  const setBodyVisible = useCallback(
    (key: string, visible: boolean) => {
      // A hidden body cannot stay selected: the move gizmo would act on something invisible.
      if (!visible) {
        const hidden = bodies.find((body) => body.key === key);
        const faces = new Set(hidden?.faces.map(formatRef) ?? []);
        setSelectedRefs(selectedRefs.filter((ref) => !faces.has(formatRef(ref))));
      }
      void run((session) => session.apply({ op: 'setBodyVisible', key, visible }));
    },
    [run, bodies, selectedRefs, setSelectedRefs],
  );

  const renameBody = useCallback(
    (key: string, name: string) => {
      void run((session) => session.apply({ op: 'renameBody', key, name }));
    },
    [run],
  );

  /** Removes bodies as one history step. */
  const removeBodies = useCallback(
    (keys: readonly string[]) => {
      const chosen = bodies.filter((body) => keys.includes(body.key));
      const handles = chosen.map(handleOf).filter((handle): handle is string => handle !== null);
      if (handles.length === 0) {
        say('This body cannot be picked out to remove.');
        return;
      }
      setSelectedRefs([]);
      addTool(
        {
          op: 'addFeature',
          id: `remove-${String(Date.now())}`,
          type: 'remove-body',
          name: chosen.length === 1 ? `Remove ${chosen[0]?.label ?? 'body'}` : 'Remove bodies',
          index: 0,
          params: { faces: handles },
        },
        false,
      );
    },
    [bodies, setSelectedRefs, addTool, say],
  );

  const removeBody = useCallback((key: string) => removeBodies([key]), [removeBodies]);

  /**
   * Deletes the selection: a picked history step, whole bodies, or faces. Lone faces are removed
   * and the surrounding faces close the gap (a round removed, the sharp edge restored), as in
   * direct modellers; the body stays. A lone edge is not deleted; the user is told what to select.
   */
  const deleteSelection = useCallback(
    (feature: FeatureId | null, removeFeature: (id: FeatureId) => void): boolean => {
      if (feature !== null) {
        removeFeature(feature);
        setSelectedFeature(null);
        return true;
      }
      if (selectedRefs.length === 0) return false;
      const picked = new Set(selectedRefs.map(formatRef));
      const whole = bodies.filter(
        (body) => body.faces.length > 0 && body.faces.every((face) => picked.has(formatRef(face))),
      );
      if (whole.length === 0) {
        const faces = selectedRefs.filter((ref) => ref.kind === 'face');
        if (faces.length === 0) {
          say('Pick faces to delete them, or double-click a body to delete it whole.');
          return false;
        }
        setSelectedRefs([]);
        addTool(
          {
            op: 'addFeature',
            id: `remove-faces-${String(Date.now())}`,
            type: 'remove-faces',
            name: faces.length === 1 ? 'Delete face' : 'Delete faces',
            index: 0,
            params: { faces: faces.map(formatRef) },
          },
          false,
        );
        return true;
      }
      removeBodies(whole.map((body) => body.key));
      return true;
    },
    [bodies, selectedRefs, removeBodies, setSelectedFeature, setSelectedRefs, addTool, say],
  );

  /** The picked bodies, or a notice saying what to pick. */
  const pickedOrSay = useCallback(
    (what: string): readonly BodySummary[] | null => {
      const picked = bodiesPicked(bodies, selectedRefs);
      if (picked.length > 0) return picked;
      if (bodies.length === 1 && bodies[0] !== undefined) return [bodies[0]];
      say(`Select the body to ${what} first.`);
      return null;
    },
    [bodies, selectedRefs, say],
  );

  /** Duplicates the picked bodies beside them. Bound to Cmd/Ctrl+D. */
  const duplicate = useCallback(() => {
    const picked = pickedOrSay('duplicate');
    if (picked === null) return;
    const faces = picked.flatMap((body) => body.faces);
    const box = boundsOf(view?.display ?? null, faces);
    const width = box === null ? 20 : box.max[0] - box.min[0];
    const id = `copy-${String(Date.now())}`;
    void run(async (session) => {
      const tried = await session.tryApply(
        {
          op: 'addFeature',
          id,
          type: 'transform-copy',
          name: 'Duplicate',
          index: session.document.features.length,
          // One body width plus a gap to the side, so the copy is visibly separate.
          params: {
            faces: picked.map(handleOf).filter((h): h is string => h !== null),
            dx: Math.ceil(width + 10),
          },
        },
        id,
      );
      if (tried.refused !== null) say(`Duplicate could not be made: ${tried.refused}`);
      else {
        setSelectedRefs(
          (tried.view.display?.faceRefs ?? []).filter(
            (ref): ref is StableRef => ref?.kind === 'face' && ref.feature === id,
          ),
        );
      }
      return tried.view;
    });
  }, [pickedOrSay, view, run, say, setSelectedRefs]);

  /** Splits the picked body through its middle; plane and offset are in its panel. */
  const addSplit = useCallback(() => {
    // Exactly two faces: split the first face's body along the second face's plane, which may be on
    // another part. A whole picked body is all its faces and splits through the middle.
    const pickedFaces = selectedRefs.filter((ref) => ref.kind === 'face');
    const along = pickedFaces.length === 2 ? pickedFaces[1] : undefined;
    const target = along === undefined ? null : bodyOf(bodies, pickedFaces[0]);
    if (along !== undefined && target !== null) {
      const handle = handleOf(target);
      if (handle === null) return;
      // A face of the same part would only graze it; start 1 mm in.
      const own = target.faces.some((ref) => formatRef(ref) === formatRef(along));
      addTool(
        {
          op: 'addFeature',
          id: `split-${String(Date.now())}`,
          type: 'split-body',
          name: 'Split',
          index: 0,
          params: { faces: [handle], plane: 'XY', along: [formatRef(along)], offset: own ? -1 : 0 },
        },
        true,
      );
      return;
    }
    const picked = pickedOrSay('split');
    const [body] = picked ?? [];
    const handle = body === undefined ? null : handleOf(body);
    if (body === undefined || handle === null) return;
    const box = boundsOf(view?.display ?? null, body.faces);
    const middle = box === null ? 0 : (box.min[2] + box.max[2]) / 2;
    addTool(
      {
        op: 'addFeature',
        id: `split-${String(Date.now())}`,
        type: 'split-body',
        name: 'Split',
        index: 0,
        params: { faces: [handle], plane: 'XY', offset: Math.round(middle * 100) / 100 },
      },
      true,
    );
  }, [pickedOrSay, view, addTool, selectedRefs, bodies]);

  /** Scales the picked bodies; the factor is entered in the panel. */
  const addScale = useCallback(() => {
    const picked = pickedOrSay('scale');
    if (picked === null) return;
    addTool(
      {
        op: 'addFeature',
        id: `scale-${String(Date.now())}`,
        type: 'scale',
        name: 'Scale',
        index: 0,
        params: {
          faces: picked.map(handleOf).filter((h): h is string => h !== null),
          factor: 1,
        },
      },
      true,
    );
  }, [pickedOrSay, addTool]);

  /**
   * Mirrors the picked bodies. Starts with a YZ plane at their right side so the image lands beside
   * them; the plane can be changed in the panel.
   */
  const addMirror = useCallback(() => {
    const picked = pickedOrSay('mirror');
    if (picked === null) return;
    const box = boundsOf(
      view?.display ?? null,
      picked.flatMap((body) => body.faces),
    );
    addTool(
      {
        op: 'addFeature',
        id: `mirror-${String(Date.now())}`,
        type: 'mirror',
        name: 'Mirror',
        index: 0,
        params: {
          faces: picked.map(handleOf).filter((h): h is string => h !== null),
          plane: 'YZ',
          offset: box === null ? 0 : Math.round(box.max[0] * 100) / 100,
        },
      },
      true,
    );
  }, [pickedOrSay, view, addTool]);

  /**
   * Aligns a body face to face with another (audit F-066): the first picked face is on the moving
   * body, the second on the target. Gap and direction are in the panel.
   */
  const addAlign = useCallback(() => {
    const faces = selectedRefs.filter((ref) => ref.kind === 'face');
    const [from, to] = faces;
    if (faces.length !== 2 || from === undefined || to === undefined) {
      say('Pick a face of the part to move, then Shift-click the face to set it against.');
      return;
    }
    if (bodyOf(bodies, from) === bodyOf(bodies, to)) {
      say('The two faces are on the same body. Pick the second on the body to set it against.');
      return;
    }
    setSelectedRefs([]);
    addTool(
      {
        op: 'addFeature',
        id: `align-${String(Date.now())}`,
        type: 'align',
        name: 'Align',
        index: 0,
        params: { from: [formatRef(from)], to: [formatRef(to)] },
      },
      true,
    );
  }, [bodies, selectedRefs, setSelectedRefs, addTool, say]);

  /**
   * Joins two parts with a joint: the first picked face is on the moving part, the second gives the
   * axis to rotate about or slide along. Kind, value and limits are in the panel.
   */
  const addJoint = useCallback(() => {
    const faces = selectedRefs.filter((ref) => ref.kind === 'face');
    const [moving, axis] = faces;
    if (faces.length !== 2 || moving === undefined || axis === undefined) {
      say('Pick a face of the part that moves, then Shift-click the face it turns or slides on.');
      return;
    }
    if (bodyOf(bodies, moving) === bodyOf(bodies, axis)) {
      say('The two faces are on the same body. Pick the second on the part it is joined to.');
      return;
    }
    setSelectedRefs([]);
    addTool(
      {
        op: 'addFeature',
        id: `joint-${String(Date.now())}`,
        type: 'joint',
        name: 'Joint',
        index: 0,
        params: { kind: 'revolute', faces: [formatRef(moving)], axis: [formatRef(axis)] },
      },
      true,
    );
  }, [bodies, selectedRefs, setSelectedRefs, addTool, say]);

  /** Repeats the picked bodies in a row, spaced by their width plus a gap. */
  const addPattern = useCallback(() => {
    const picked = pickedOrSay('repeat');
    if (picked === null) return;
    const box = boundsOf(
      view?.display ?? null,
      picked.flatMap((body) => body.faces),
    );
    const width = box === null ? 20 : box.max[0] - box.min[0];
    addTool(
      {
        op: 'addFeature',
        id: `pattern-${String(Date.now())}`,
        type: 'pattern',
        name: 'Pattern',
        index: 0,
        params: {
          faces: picked.map(handleOf).filter((h): h is string => h !== null),
          arrangement: 'linear',
          count: 3,
          dx: Math.round((width + 10) * 100) / 100,
        },
      },
      true,
    );
  }, [pickedOrSay, view, addTool]);

  /**
   * Combines the picked bodies: the first is kept and the rest act on it. Starts as a join; cut and
   * intersect are options in the feature panel.
   */
  const addCombine = useCallback(
    (operation: 'join' | 'cut' | 'intersect' = 'join') => {
      const picked = bodiesPicked(bodies, selectedRefs);
      const handles = picked.map(handleOf).filter((h): h is string => h !== null);
      const [target, ...tools] = handles;
      if (target === undefined || tools.length === 0) {
        say('Select two bodies: first the one to keep, then the one to combine with it.');
        return;
      }
      setSelectedRefs([]);
      addTool(
        {
          op: 'addFeature',
          id: `combine-${String(Date.now())}`,
          type: 'combine',
          name: operation === 'join' ? 'Union' : operation === 'cut' ? 'Subtract' : 'Intersect',
          index: 0,
          params: { target: [target], tools, operation, keepTools: false },
        },
        true,
      );
    },
    [bodies, selectedRefs, setSelectedRefs, addTool, say],
  );

  /**
   * After a part is made or moved, asks about any body it now touches: join, cut, or keep separate.
   */
  const checkContacts = useCallback(
    (face: StableRef) => {
      // Skipped for assemblies: nearly every part touches another, and checking held the geometry
      // worker for up to 24 s after a move in the Voron.
      if (bodiesRef.current.length > CONTACT_BODIES) return;
      void sessionRef.current?.contactsOf(face).then((found) => {
        setContactFace(face);
        setContacts(found);
      });
    },
    [sessionRef],
  );

  /** Applies the answer. */
  const resolveContacts = useCallback(
    (choice: 'join' | 'cut' | 'keep') => {
      const [first] = contacts;
      setContacts([]);
      if (choice === 'keep' || first === undefined) return;
      const target = contacts
        .map((item) => handleOf(item.body))
        .filter((h): h is string => h !== null);
      const tool = handleOf(first.subject);
      if (tool === null || target.length === 0) return;
      addTool(
        {
          op: 'addFeature',
          id: `combine-${String(Date.now())}`,
          type: 'combine',
          name: choice === 'join' ? 'Join' : 'Cut',
          index: 0,
          params: { target, tools: [tool], operation: choice, keepTools: false },
        },
        false,
      );
    },
    [contacts, addTool],
  );

  /** Everything the Items panel needs for its body rows. */
  // Reordering and rolling back history steps (`use-history-order.ts`), offered beside the bodies.
  const history = useHistoryOrder(run, sessionRef, view, say);
  const itemsProps = useMemo(
    (): Pick<
      ItemsPanelProps,
      | 'bodies'
      | 'selectedBodies'
      | 'onSelectBody'
      | 'onSelectBodies'
      | 'onToggleBodyVisible'
      | 'onRemoveBody'
      | 'onRenameBody'
      | 'rollback'
      | 'onRollback'
      | 'onMove'
    > => ({
      ...history,
      bodies,
      selectedBodies: new Set(bodiesPicked(bodies, selectedRefs).map((body) => body.key)),
      onSelectBody: selectBody,
      onSelectBodies: selectBodies,
      onToggleBodyVisible: setBodyVisible,
      onRemoveBody: removeBody,
      onRenameBody: renameBody,
    }),
    [
      bodies,
      selectedRefs,
      selectBody,
      selectBodies,
      setBodyVisible,
      removeBody,
      renameBody,
      history,
    ],
  );

  /** Runs the rail's whole-body command `id`; returns whether it was one. */
  const command = (id: string): boolean => {
    const run = {
      combine: addCombine,
      split: addSplit,
      scale: addScale,
      mirror: addMirror,
      align: addAlign,
      joint: addJoint,
      pattern: addPattern,
    }[id];
    run?.();
    return run !== undefined;
  };

  return {
    itemsProps,
    command,
    addCombine,
    addSplit,
    addScale,
    addMirror,
    addAlign,
    addPattern,
    duplicate,
    deleteSelection,
    contactProps: { contacts, face: contactFace, onAnswer: resolveContacts },
    checkContacts,
  };
}
