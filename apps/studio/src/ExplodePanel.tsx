/** The exploded view: the bodies pulled apart to see how they go together. It only looks. */

import { Slider } from '@bezier/ui';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { InspectionPanel } from './InspectionPanel.js';
import type { SessionView } from './session.js';
import type { ViewportHandle } from './Viewport.js';

const partsOf = (bodies: SessionView['bodies'] | undefined) =>
  (bodies ?? []).filter((body) => !body.hidden).map((body) => body.faces);

export function ExplodePanel({
  view,
  handleRef,
  onClose,
}: {
  view: SessionView | null;
  handleRef: RefObject<ViewportHandle | null>;
  onClose: () => void;
}) {
  const [apart, setApart] = useState(40);
  const bodies = view?.bodies;
  const opening = useRef(bodies);

  // Framed once with the bodies at their widest, and put back when the view closes.
  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null) return;
    const before = handle.cameraView();
    handle.setExploded(partsOf(opening.current), 1);
    handle.zoomToFit();
    return () => handle.showCameraView(before, true);
  }, [handleRef]);

  useEffect(() => {
    const parts = partsOf(bodies);
    handleRef.current?.setExploded(parts, apart / 100);
    return () => handleRef.current?.setExploded(parts, 0);
  }, [bodies, apart, handleRef]);
  const alone = (bodies ?? []).length < 2;
  useEffect(() => {
    if (alone) onClose();
  }, [alone, onClose]);
  return (
    <InspectionPanel label="Exploded view" onClose={onClose} title="Exploded view">
      <div className="wall-panel">
        <Slider
          format={(value) => `${String(value)} %`}
          label="Apart"
          max={100}
          min={0}
          onChange={setApart}
          value={apart}
        />
      </div>
    </InspectionPanel>
  );
}
