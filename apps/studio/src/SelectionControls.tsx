import { ConstraintBar } from './ConstraintBar.js';
import { FILTER_LABEL, type SelectionFilter } from './selection-filter.js';
import type { SketchState } from './use-sketch.js';

export function SelectionControls({
  filter,
  onClearFilter,
  sketching,
  sketch,
}: {
  filter: SelectionFilter;
  onClearFilter: () => void;
  sketching: boolean;
  sketch: SketchState;
}) {
  return (
    <>
      {filter !== 'any' && (
        <button className="selection-filter" onClick={onClearFilter} type="button">
          Selecting {FILTER_LABEL[filter]} · Tab to change
        </button>
      )}
      {sketching && sketch.tool === null && sketch.selected.length > 0 && (
        <ConstraintBar
          onConstrain={sketch.constrainSelection}
          onCorner={sketch.roundSelectedCorner}
          selected={sketch.selected}
          sketch={sketch.draft}
        />
      )}
    </>
  );
}
