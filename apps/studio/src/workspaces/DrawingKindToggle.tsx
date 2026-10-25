/**
 * Drawing sheets or physics drawings, the first group in Drawings' bar. Both are sheets of one
 * book; this switches the visible kind by opening that kind's first sheet.
 */

export type DrawingKind = 'sheets' | 'physics';

export function DrawingKindToggle({
  kind,
  onKind,
  physicsCount,
}: {
  kind: DrawingKind;
  onKind: (kind: DrawingKind) => void;
  physicsCount: number;
}) {
  return (
    <fieldset aria-label="Kind of drawing" className="dwg-toolbar__group dwg-kind">
      <button aria-pressed={kind === 'sheets'} onClick={() => onKind('sheets')} type="button">
        Drawings
      </button>
      <button
        aria-pressed={kind === 'physics'}
        disabled={physicsCount === 0}
        onClick={() => onKind('physics')}
        title={
          physicsCount === 0
            ? 'Solve a study in Simulation and choose Create physics drawing'
            : undefined
        }
        type="button"
      >
        Physics
        {physicsCount > 0 && <small>{physicsCount}</small>}
      </button>
    </fieldset>
  );
}
