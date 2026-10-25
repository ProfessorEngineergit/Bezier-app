import type { BodySummary, FeatureRecord } from '@bezier/core';
import { DeleteIcon, DrawingsIcon, ModelingIcon, SketchIcon } from '@bezier/ui';
import { ITEMS_WIDTH_DEFAULT, ITEMS_WIDTH_MAX, ITEMS_WIDTH_MIN } from '../ItemsPanel.js';
import { ResizeHandle } from '../ResizeHandle.js';
import type { DrawingSheet } from './drawing-sheets.js';
import type { useDrawingSheets } from './use-drawing-sheets.js';

export function DrawingItems({
  book,
  width,
  onWidthChange,
  bodies,
  features,
  includedBodies,
  onBodies,
  onSketches,
  sheets,
}: {
  /** The sheets of the kind on show: drawing sheets, or physics drawings. */
  sheets: readonly DrawingSheet[];
  book: ReturnType<typeof useDrawingSheets>;
  width: number;
  onWidthChange: (width: number) => void;
  bodies: readonly BodySummary[];
  features: readonly FeatureRecord[];
  includedBodies: readonly string[];
  onBodies: (keys: string[]) => void;
  onSketches: (keys: string[]) => void;
}) {
  const toggle = (keys: readonly string[], key: string) =>
    keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
  // Sheets selected together with Shift, ⌘ or Ctrl (audit A13): included content is set on all of
  // them, and they can be deleted together. The open sheet is always one of them.
  const { chosen, setChosen } = book;
  const together = [
    book.sheet.id,
    ...chosen.filter((id) => id !== book.sheet.id && sheets.some((s) => s.id === id)),
  ];
  const many = together.length > 1;
  const others = together.filter((id) => id !== book.sheet.id);
  const setBodies = (keys: string[]) => {
    if (many) book.fieldOn(others, 'bodies', keys);
    onBodies(keys);
  };
  const setSketches = (keys: string[]) => {
    if (many) book.fieldOn(others, 'sketches', keys);
    onSketches(keys);
  };
  const sketches = features.filter((f) => f.type === 'sketch' && !f.suppressed);
  const physics = book.sheet.physics !== undefined;
  return (
    <aside aria-label="Drawing items" className="dwg-items items-panel">
      <header className="items-panel__head">
        <h2>Items</h2>
        {/* Physics drawings are made in Simulation, from a solved study, and not added here. */}
        {!physics && (
          <button
            type="button"
            aria-label="Add sheet from Items"
            title="New blank sheet"
            onClick={book.add}
            disabled={!book.ready}
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </header>
      <div className="dwg-items__body">
        <h3>
          {physics ? 'Physics drawings' : 'Sheets'} <small>{sheets.length}</small>
        </h3>
        <ul className="dwg-items__sheets">
          {sheets.map((sheet) => (
            <li
              key={sheet.id}
              data-active={sheet.id === book.sheet.id ? '' : undefined}
              data-chosen={many && together.includes(sheet.id) ? '' : undefined}
            >
              <button
                type="button"
                onClick={(event) => {
                  if (event.shiftKey || event.metaKey || event.ctrlKey) {
                    setChosen(
                      together.includes(sheet.id)
                        ? together.filter((id) => id !== sheet.id)
                        : [...together, sheet.id],
                    );
                    if (sheet.id !== book.sheet.id && !together.includes(sheet.id))
                      book.select(sheet.id);
                    return;
                  }
                  setChosen([]);
                  book.select(sheet.id);
                }}
                aria-current={sheet.id === book.sheet.id}
                aria-pressed={many ? together.includes(sheet.id) : undefined}
              >
                <DrawingsIcon />
                <span>
                  {sheet.name}
                  <small>
                    {sheet.options.format} · {sheet.options.number}
                    <br />
                    {sheet.physics !== undefined
                      ? `${sheet.physics.study} · ${sheet.physics.created}`
                      : `${
                          sheet.bodies === null
                            ? bodies.filter((b) => !b.hidden).length
                            : sheet.bodies.length
                        } bodies · ${sheet.sketches.length} sketches`}
                  </small>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${sheet.name}`}
                disabled={book.sheets.length < 2}
                onClick={() => book.remove(sheet.id)}
              >
                <DeleteIcon />
              </button>
            </li>
          ))}
        </ul>
        {many && (
          <div className="dwg-items__chosen" role="status">
            <span>{together.length} sheets chosen</span>
            <button
              type="button"
              disabled={together.length >= book.sheets.length}
              onClick={() => {
                book.removeMany(together);
                setChosen([]);
              }}
            >
              <DeleteIcon />
              Delete {together.length}
            </button>
          </div>
        )}
        {!physics && (
          <>
            <h3>Included on {many ? `${together.length} sheets` : book.sheet.name}</h3>
            <div className="dwg-items__batch">
              <button type="button" onClick={() => setBodies(bodies.map((b) => b.key))}>
                All bodies
              </button>
              <button type="button" onClick={() => setBodies([])}>
                None
              </button>
            </div>
            <h4>Bodies</h4>
            {bodies.map((body) => (
              <label className="dwg-items__choice" key={body.key}>
                <input
                  type="checkbox"
                  checked={includedBodies.includes(body.key)}
                  onChange={() => setBodies(toggle(includedBodies, body.key))}
                />
                <ModelingIcon />
                <span>{body.label}</span>
              </label>
            ))}
            {bodies.length === 0 && <p className="dwg-items__empty">No bodies yet</p>}
            <h4>Sketches</h4>
            {sketches.map((sketch) => (
              <label className="dwg-items__choice" key={sketch.id}>
                <input
                  type="checkbox"
                  checked={book.sheet.sketches.includes(sketch.id)}
                  onChange={() => setSketches(toggle(book.sheet.sketches, sketch.id))}
                />
                <SketchIcon />
                <span>{sketch.name}</span>
              </label>
            ))}
            {sketches.length === 0 && <p className="dwg-items__empty">No sketches yet</p>}
          </>
        )}
      </div>
      <ResizeHandle
        className="items-panel__resize"
        label="Resize drawing items panel"
        width={width}
        min={ITEMS_WIDTH_MIN}
        max={ITEMS_WIDTH_MAX}
        reset={ITEMS_WIDTH_DEFAULT}
        onResize={onWidthChange}
      />
    </aside>
  );
}
