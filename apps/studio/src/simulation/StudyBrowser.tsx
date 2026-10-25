/**
 * Placements on the part, in the left Items panel shared with other workspaces (same frame, head,
 * rows, hover-only actions, resize handle and width). The study itself (material, mesh, Solve) is
 * on the right (`SimulationInspector.tsx`).
 */

import { DeleteIcon } from '@bezier/ui';
import { ITEMS_WIDTH_DEFAULT, ITEMS_WIDTH_MAX, ITEMS_WIDTH_MIN } from '../ItemsPanel.js';
import { ResizeHandle } from '../ResizeHandle.js';
import { iconOf, summaryOf, titleOf } from './SimulationParts.js';
import type { Placement, SimulationHandle } from './use-simulation.js';

export function StudyBrowser({
  sim,
  width,
  onWidthChange,
}: {
  sim: SimulationHandle;
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const thermal = sim.study.kind === 'thermal';
  const groups: { title: string; rows: readonly Placement[]; empty: string }[] = thermal
    ? [
        {
          title: 'Temperatures and air',
          rows: sim.study.thermal.filter((c) => c.kind !== 'heat'),
          empty: 'Choose Temperature or Convection in the rail, then click the faces.',
        },
        {
          title: 'Heat',
          rows: sim.study.thermal.filter((c) => c.kind === 'heat'),
          empty: 'Choose Heat, then click the faces it comes in through.',
        },
      ]
    : [
        {
          title: 'Supports',
          rows: sim.study.constraints,
          empty: 'Choose Fixed or Pin in the rail, then click the faces that are held.',
        },
        {
          title: 'Loads',
          rows: sim.study.loads,
          empty: 'Choose Force or Pressure, then click the faces it acts on.',
        },
      ];
  return (
    <aside aria-label="Study browser" className="items-panel" style={{ width: `${width}px` }}>
      <header className="items-panel__head">
        <h2>{sim.study.name}</h2>
      </header>
      <div className="items-panel__body">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="items-section">{group.title}</h3>
            {group.rows.length === 0 ? (
              <p className="items-panel__hint">{group.empty}</p>
            ) : (
              <ul className="items-list">
                {group.rows.map((placement) => (
                  <li key={placement.id}>
                    <div className="items-entry">
                      <button
                        aria-current={sim.editing?.id === placement.id}
                        className="items-row"
                        onClick={() => sim.setEditing(placement.id)}
                        type="button"
                      >
                        <span aria-hidden="true" className="items-row__icon">
                          {iconOf(placement)}
                        </span>
                        <span className="items-row__text">
                          <span className="items-row__name">{titleOf(placement)}</span>
                          <span className="items-row__note">{summaryOf(placement)}</span>
                        </span>
                      </button>
                      <span className="items-row__actions">
                        <button
                          aria-label={`Delete ${titleOf(placement)}`}
                          onClick={() => sim.removePlacement(placement.id)}
                          title="Delete"
                          type="button"
                        >
                          <DeleteIcon />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {sim.result !== null && (
          <>
            <h3 className="items-section">Result</h3>
            <p className="items-panel__hint">
              {sim.stale ? 'Out of date' : 'Solved'} · {sim.result.seconds.toFixed(1)} s ·{' '}
              {sim.result.elements.toLocaleString('en-US')} elements
            </p>
          </>
        )}
      </div>
      <ResizeHandle
        className="items-panel__resize"
        label="Resize study browser"
        max={ITEMS_WIDTH_MAX}
        min={ITEMS_WIDTH_MIN}
        onResize={onWidthChange}
        reset={ITEMS_WIDTH_DEFAULT}
        width={width}
      />
    </aside>
  );
}
