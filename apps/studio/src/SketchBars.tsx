/** The bars at the foot of a sketch: the open action, or the plane the sketch stands on. */
import type { ComponentProps } from 'react';
import { SketchActionBar } from './SketchActionBar.js';
import { SketchPlanePanel } from './SketchPlanePanel.js';
import type { ActiveSurface } from './use-sketch.js';

type Action = ComponentProps<typeof SketchActionBar>;

export function SketchBars({
  sketching,
  idle,
  commands,
  sketch,
  surface,
  onSurface,
}: {
  sketching: boolean;
  /** No step is open in the inspector. */
  idle: boolean;
  commands: {
    action: Action['action'] | null;
    closeAction: () => void;
    textAt: NonNullable<Action['placeAt']> | null;
  };
  sketch: Pick<Action, 'selected'> & {
    draft: Action['sketch'];
    applyEdit: Action['onApply'];
    freedom: NonNullable<ComponentProps<typeof SketchPlanePanel>['freedom']> | null;
  };
  surface: ActiveSurface | null;
  onSurface: ComponentProps<typeof SketchPlanePanel>['onChange'];
}) {
  if (!sketching) return null;
  if (commands.action !== null) {
    return (
      <SketchActionBar
        action={commands.action}
        onApply={sketch.applyEdit}
        onClose={commands.closeAction}
        placeAt={commands.textAt}
        selected={sketch.selected}
        sketch={sketch.draft}
      />
    );
  }
  if (surface === null || !idle || sketch.selected.length > 0) return null;
  return <SketchPlanePanel freedom={sketch.freedom} onChange={onSurface} surface={surface} />;
}
