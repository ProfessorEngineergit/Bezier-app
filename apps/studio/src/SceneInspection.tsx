import type { StableRef } from '@bezier/core';
import type { ViewSettings } from '@bezier/ui';
import { type MutableRefObject, type RefObject, useMemo, useRef } from 'react';
import { BodyMeasure } from './BodyMeasure.js';
import { ExplodePanel } from './ExplodePanel.js';
import { MeasureMode } from './MeasureMode.js';
import type { MeasurePoint } from './measurements.js';
import { SectionPanel } from './SectionPanel.js';
import type { Session, SessionView } from './session.js';
import { bodiesPicked } from './use-bodies.js';
import type { ViewportHandle } from './Viewport.js';
import { WallThicknessPanel } from './WallThicknessPanel.js';

export function SceneInspection({
  settings,
  measuring,
  walls,
  onCloseWalls,
  exploded,
  onCloseExploded,
  points,
  view,
  handleRef,
  onSection,
  setPoints,
  onClose,
  selected,
  sessionRef,
}: {
  settings: ViewSettings;
  measuring: boolean;
  /** Wall thickness is showing. */
  walls: boolean;
  onCloseWalls: () => void;
  /** The exploded view is showing. */
  exploded: boolean;
  onCloseExploded: () => void;
  points: readonly MeasurePoint[];
  /** The displayed model: what is measured, and which project the pins belong to. */
  view: SessionView | null;
  handleRef: RefObject<ViewportHandle | null>;
  onSection: (
    patch: Partial<Pick<ViewSettings, 'section' | 'sectionAxis' | 'sectionFlip'>>,
  ) => void;
  setPoints: (points: readonly MeasurePoint[]) => void;
  onClose: () => void;
  /** The current pick; bodies in it are measured whole. */
  selected: readonly StableRef[];
  sessionRef: MutableRefObject<Session | null>;
}) {
  const bodies = view?.bodies;
  // Opening Measure clears the pick (its clicks are points), so the pick at opening is what is
  // measured; with nothing picked there is no body section.
  const before = useRef(selected);
  if (!measuring) before.current = selected;
  const pick = measuring ? before.current : selected;
  // Memoized on the pick and bodies so the measurement is not recomputed every render.
  const picked = useMemo(() => bodiesPicked(bodies ?? [], pick), [bodies, pick]);
  const faces = useMemo(() => picked.flatMap((body) => body.faces), [picked]);
  const centre = (axis = settings.sectionAxis) => handleRef.current?.contentCenter()?.[axis] ?? 0;
  return (
    <>
      {walls && <WallThicknessPanel handleRef={handleRef} onClose={onCloseWalls} view={view} />}
      {exploded && <ExplodePanel handleRef={handleRef} onClose={onCloseExploded} view={view} />}
      {settings.section !== null && !measuring && (
        <SectionPanel
          at={settings.section}
          onChange={(section) => onSection({ section })}
          onCenter={centre}
          onPlane={(plane) =>
            onSection({
              ...plane,
              // A new axis starts through the model, not wherever the last one stood.
              ...(plane.sectionAxis === undefined ? {} : { section: centre(plane.sectionAxis) }),
            })
          }
          settings={settings}
        />
      )}
      <MeasureMode
        active={measuring}
        geometry={view?.display ?? null}
        project={view?.document.meta.createdAt ?? null}
        handleRef={handleRef}
        onClear={() => setPoints([])}
        onClose={() => {
          onClose();
          setPoints([]);
        }}
        points={points}
        settings={settings}
        body={
          <BodyMeasure
            count={picked.length}
            faces={faces}
            sessionRef={sessionRef}
            settings={settings}
          />
        }
      />
    </>
  );
}
