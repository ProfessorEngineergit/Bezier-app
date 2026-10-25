/** Volume, surface area and centre of mass of the picked bodies, shown in Measure. */
import type { StableRef } from '@bezier/core';
import type { MassProperties } from '@bezier/kernel';
import { formatArea, formatLength, formatVolume, type ViewSettings } from '@bezier/ui';
import { type MutableRefObject, useEffect, useState } from 'react';
import type { Session } from './session.js';

export function BodyMeasure({
  faces,
  count,
  sessionRef,
  settings,
}: {
  /** The faces of the picked bodies, all of them. */
  faces: readonly StableRef[];
  count: number;
  sessionRef: MutableRefObject<Session | null>;
  settings: ViewSettings;
}) {
  const [mass, setMass] = useState<MassProperties | null>(null);
  useEffect(() => {
    let live = true;
    setMass(null);
    if (faces.length === 0) return;
    void sessionRef.current?.massOf(faces).then((found) => {
      if (live) setMass(found);
    });
    return () => {
      live = false;
    };
  }, [faces, sessionRef]);
  if (faces.length === 0) return null;
  const at = mass?.centre;
  return (
    <section aria-label="Body measurements" className="measure-body">
      <p className="inspection-panel__eyebrow">
        {count === 1 ? 'Picked body' : `${count} picked bodies`}
      </p>
      {mass === null ? (
        <p className="measure-hint">Measuring…</p>
      ) : (
        <dl className="measure-result measure-body__result">
          <div>
            <dt>Volume</dt>
            <dd>{formatVolume(mass.volume, settings)}</dd>
          </div>
          <div>
            <dt>Surface</dt>
            <dd>{formatArea(mass.area, settings)}</dd>
          </div>
          {at !== undefined && (
            <div>
              <dt>Centre</dt>
              <dd>{[at.x, at.y, at.z].map((v) => formatLength(v, settings)).join(', ')}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
