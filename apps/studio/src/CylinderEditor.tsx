/** Edits a cylinder's radius; the picked wall supplies a fixed world anchor. */
import { formatRef, type Operation } from '@bezier/core';
import type { CylindricalFace } from '@bezier/kernel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { coalescePreview } from './coalesce-preview.js';
import { ExtrudeGizmo } from './ExtrudeGizmo.js';
import type { FaceExtrusionProps } from './FaceExtrusion.js';
import type { Session } from './session.js';

export function CylinderEditor({
  face,
  point,
  cylinder,
  handleRef,
  sessionRef,
  run,
  setView,
}: FaceExtrusionProps & { cylinder: CylindricalFace }) {
  const [id] = useState(() => `cylinder-radius-${crypto.randomUUID()}`);
  const [radius, setRadius] = useState(cylinder.radius);
  const [revision, setRevision] = useState(0);
  const frame = useRef(cylinderFrame(cylinder, point));
  const anchor = useMemo(
    () => ({
      x: frame.current.anchor.x + frame.current.radial.x * (radius - cylinder.radius),
      y: frame.current.anchor.y + frame.current.radial.y * (radius - cylinder.radius),
      z: frame.current.anchor.z + frame.current.radial.z * (radius - cylinder.radius),
    }),
    [radius, cylinder.radius],
  );
  const change = (session: Session, value: number): Operation => {
    const params = { faces: [formatRef(face)], radius: value };
    return session.document.features.some((f) => f.id === id)
      ? { op: 'updateParams', id, params }
      : {
          op: 'addFeature',
          id,
          type: 'cylinder-radius',
          name: cylinder.inward ? 'Hole radius' : 'Cylinder radius',
          index: session.document.features.length,
          params,
        };
  };
  const [preview] = useState(() =>
    coalescePreview<number, Awaited<ReturnType<Session['partPreview']>>>(
      async (value) => {
        const session = sessionRef.current;
        if (!session) return null;
        return session.partPreview(
          { kind: 'radius', face, radius: value },
          session.document.features.some((f) => f.id === id) ? id : undefined,
        );
      },
      (part) => handleRef.current?.showPartPreview(part, part?.replaces),
    ),
  );
  useEffect(
    () => () => {
      preview.cancel();
      handleRef.current?.showPartPreview(null);
      void sessionRef.current?.endPartPreview();
    },
    [handleRef, sessionRef, preview],
  );
  return (
    <>
      <ExtrudeGizmo
        key={revision}
        anchor={anchor}
        normal={frame.current.radial}
        handleRef={handleRef}
        faceRef={null}
        label={cylinder.inward ? 'Hole' : 'Cylinder'}
        valueLabel="Cylinder radius"
        showOptions={false}
        distance={radius}
        directionMode="forward"
        operation="cut"
        canCombine
        showDirection={false}
        onDirectionChange={() => {}}
        onOperationChange={() => {}}
        onPreview={(value) => preview.request(value)}
        onCommit={(value) => {
          if (value === radius) {
            handleRef.current?.showPartPreview(null);
            return;
          }
          preview.cancel();
          run(async (session) => {
            const tried = await session.tryApply(change(session, value), id);
            handleRef.current?.showPartPreview(null);
            if (tried.refused) {
              setRevision((r) => r + 1);
              setView(tried.view);
              throw new Error(tried.refused);
            }
            setRadius(value);
            return tried.view;
          });
        }}
      />
    </>
  );
}

function cylinderFrame(cylinder: CylindricalFace, point: FaceExtrusionProps['point']) {
  const { origin, axis, height, radius } = cylinder;
  const delta = point
    ? { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z }
    : cylinder.radial;
  const along = delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
  const r = {
    x: delta.x - along * axis.x,
    y: delta.y - along * axis.y,
    z: delta.z - along * axis.z,
  };
  const length = Math.hypot(r.x, r.y, r.z);
  const radial =
    length < 1e-7 ? cylinder.radial : { x: r.x / length, y: r.y / length, z: r.z / length };
  const t = point ? Math.max(0, Math.min(height, along)) : height / 2;
  return {
    radial,
    anchor: {
      x: origin.x + axis.x * t + radial.x * radius,
      y: origin.y + axis.y * t + radial.y * radius,
      z: origin.z + axis.z * t + radial.z * radius,
    },
  };
}
