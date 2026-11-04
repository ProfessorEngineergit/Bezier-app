/** What the parts library does: opens, and turns a choice into steps in the history. */

import {
  type FastenerPlacement,
  type FeatureId,
  formatRef,
  METRIC_SIZES,
  type StableRef,
  worldToPlane,
} from '@bezier/core';
import { type RefObject, useCallback, useEffect, useState } from 'react';
import type { Session, SessionView } from '../session.js';
import { addOrExplain } from '../use-geometry.js';
import type { ViewportHandle } from '../Viewport.js';
import type { StandardPart } from './catalog.js';
import {
  addOwnPart,
  listOwnParts,
  type OwnPart,
  ownPartModel,
  removeOwnPart,
} from './own-parts.js';
import type { PartsLibraryProps } from './PartsLibrary.js';
import { readServerModel, readServerParts, type ServerPart } from './server-parts.js';

type Run = (change: (session: Session) => Promise<SessionView>) => unknown;

const ADDRESS_KEY = 'bezier.parts.server';
const round = (value: number) => Math.round(value * 100) / 100;

const readAddress = () => {
  try {
    return window.localStorage.getItem(ADDRESS_KEY) ?? '';
  } catch {
    return '';
  }
};

const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const MAX_OWN_MODEL = 64 * 1024 * 1024;
const MAX_OWN_PICTURE = 8 * 1024 * 1024;

/** The hole that fits a part, for the parts that have one to go through. */
const headHeight = (size: string) =>
  METRIC_SIZES.find((entry) => entry.name === size)?.capHeight ?? 0;

function holeFor(part: StandardPart, size: string) {
  if (part.kind === 'hex-nut' || part.kind === 'washer') return null;
  const style =
    part.kind === 'socket-head'
      ? 'counterbore'
      : part.kind === 'countersunk'
        ? 'countersink'
        : 'simple';
  return { standard: size, fit: 'clearance', through: true, depth: 10, style };
}

export function usePartsLibrary({
  run,
  say,
  selectedRefs,
  lastPoint,
  viewportRef,
  setSelectedFeature,
}: {
  run: Run;
  say: (message: string) => void;
  selectedRefs: readonly StableRef[];
  lastPoint: RefObject<{ x: number; y: number; z: number } | null>;
  viewportRef: RefObject<ViewportHandle | null>;
  setSelectedFeature: (id: FeatureId | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState<readonly OwnPart[]>([]);
  const [address, setAddress] = useState(readAddress);
  const [parts, setParts] = useState<readonly ServerPart[]>([]);
  const [failed, setFailed] = useState<string | null>(null);

  const connect = useCallback(async (next: string) => {
    setFailed(null);
    setAddress(next);
    try {
      window.localStorage.setItem(ADDRESS_KEY, next);
    } catch {
      // Without storage it asks again next time.
    }
    if (next.trim() === '') return setParts([]);
    try {
      setParts(await readServerParts(next));
    } catch (error) {
      setParts([]);
      setFailed(error instanceof Error ? error.message : 'That server could not be read.');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void listOwnParts().then(setOwn);
    if (address !== '') void connect(address);
  }, [open, address, connect]);

  const face =
    selectedRefs.length === 1 ? selectedRefs.find((ref) => ref.kind === 'face') : undefined;

  const addStandard: PartsLibraryProps['onAddStandard'] = (part, size, length, withHole) => {
    const id = `fastener-${String(Date.now())}`;
    const point =
      face === undefined
        ? null
        : (lastPoint.current ?? viewportRef.current?.faceCentroid(face) ?? null);
    const normal = face === undefined ? null : (viewportRef.current?.faceNormal(face) ?? null);
    void run(async (session) => {
      const index = session.document.features.length;
      const hole = withHole && face !== undefined ? holeFor(part, size) : null;
      const seat = point !== null && normal !== null ? { origin: point, normal } : null;
      // A socket head goes down its counterbore, the depth of the head.
      const sunk = hole?.style === 'counterbore' ? headHeight(size) : 0;
      const placement: FastenerPlacement | null =
        seat === null
          ? null
          : {
              normal: seat.normal,
              origin: {
                x: seat.origin.x - seat.normal.x * sunk,
                y: seat.origin.y - seat.normal.y * sunk,
                z: seat.origin.z - seat.normal.z * sunk,
              },
            };
      const operations = [];
      if (hole !== null && face !== undefined && placement !== null) {
        const basis = await session.sketchBasisOn(face);
        if (basis === null) {
          say('A hole needs a flat face.');
          return session.rebuild();
        }
        const at = worldToPlane(basis, seat?.origin ?? placement.origin);
        operations.push({
          op: 'addFeature' as const,
          id: `hole-${String(Date.now())}`,
          type: 'hole',
          name: 'Hole',
          index,
          params: {
            faces: [formatRef(face)],
            x: round(at.u),
            y: round(at.v),
            diameter: 5,
            headDiameter: 9,
            headDepth: 3,
            sinkAngle: 90,
            ...hole,
          },
        });
      }
      operations.push({
        op: 'addFeature' as const,
        id,
        type: 'fastener',
        name: `${size} ${part.name}`,
        index: index + operations.length,
        params: {
          kind: part.kind,
          size,
          length,
          plane: 'XY',
          placement: placement === null ? '' : JSON.stringify(placement),
        },
      });
      const tried = await session.tryApply(operations, id);
      if (tried.refused !== null) say(`${part.name} could not be added: ${tried.refused}`);
      else setSelectedFeature(id);
      return tried.view;
    });
  };

  const addModel = (name: string, file: string) => {
    const id = `import-${String(Date.now())}`;
    void run((session) =>
      addOrExplain(session, say, id, name, {
        op: 'addFeature',
        id,
        type: 'import-step',
        name,
        index: session.document.features.length,
        params: { file, placement: 'ground', dx: 0, format: 'step', faceOrder: 'file' },
      }),
    );
  };

  const props: Omit<PartsLibraryProps, 'onFace'> & { onFace: boolean } = {
    onFace: face !== undefined,
    own,
    server: { address, parts, failed },
    onClose: () => setOpen(false),
    onAddStandard: addStandard,
    onAddOwn: (part) => {
      void ownPartModel(part.id).then((model) => {
        if (model === null) say('The model of this part is gone. Add it again.');
        else addModel(part.name, model);
      });
    },
    onAddServer: (part) => {
      void readServerModel(part.model)
        .then((model) => addModel(part.name, model))
        .catch(() => say(`${part.name} could not be read from the server.`));
    },
    onImport: (files) => {
      void (async () => {
        const model = files.find((file) => /\.(step|stp)$/i.test(file.name));
        const picture = files.find((file) => /\.(png|jpe?g|webp)$/i.test(file.name));
        if (model === undefined) return say('Pick a STEP file, and a picture of it with it.');
        if (model.size > MAX_OWN_MODEL || (picture?.size ?? 0) > MAX_OWN_PICTURE) {
          return say('That file is larger than the library accepts.');
        }
        const name = model.name.replace(/\.(step|stp)$/i, '');
        const image = picture === undefined ? null : await dataUrl(picture);
        setOwn(await addOwnPart(name, await model.text(), image));
      })();
    },
    onRemoveOwn: (part) => {
      void removeOwnPart(part.id).then(setOwn);
    },
    onConnect: (next) => void connect(next),
  };

  const toggle = useCallback(() => setOpen((was) => !was), []);
  return { open, toggle, props };
}
