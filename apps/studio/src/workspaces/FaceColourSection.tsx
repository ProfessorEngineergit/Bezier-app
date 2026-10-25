/**
 * Colour for individual faces: the selection, a palette and hex field, and a way back to the
 * body's look. Shown above the material list while faces are picked.
 */

const PALETTE = [
  '#e5484d',
  '#f76b15',
  '#f5d90a',
  '#30a46c',
  '#0a84ff',
  '#8e4ec6',
  '#f5f5f7',
  '#8b8d98',
  '#26272b',
];

/**
 * What a material applies to: picked faces, picked bodies or all, and for faces a way back to
 * their body's material.
 */
export function ApplyTo({
  assignment,
}: {
  assignment: { label: string; onFaces: boolean; facesOwn: boolean; resetFaces: () => void };
}) {
  return (
    <>
      <p className="viz-assignment" aria-live="polite">
        Apply to: {assignment.label}
      </p>
      {assignment.onFaces ? (
        <button
          className="viz-faces__clear"
          disabled={!assignment.facesOwn}
          onClick={assignment.resetFaces}
          type="button"
        >
          Use the body's material
        </button>
      ) : (
        <p className="viz-note">
          Click a face to give it a material of its own; double-click for the whole body.
        </p>
      )}
    </>
  );
}

export function FaceColourSection({
  count,
  colour,
  coloured,
  onPaint,
}: {
  count: number;
  colour: string | null;
  coloured: boolean;
  onPaint: (colour: string | null) => void;
}) {
  return (
    <section className="viz-section viz-faces">
      <p className="viz-assignment" aria-live="polite">
        {count === 0
          ? 'Point at a face and click it. Shift-click adds more.'
          : count === 1
            ? '1 face picked'
            : `${count} faces picked`}
      </p>
      <fieldset aria-label="Face colour" className="viz-faces__palette">
        {PALETTE.map((hex) => (
          <button
            aria-label={hex}
            aria-pressed={colour?.toLowerCase() === hex}
            className="viz-faces__swatch"
            disabled={count === 0}
            key={hex}
            onClick={() => onPaint(hex)}
            style={{ background: hex }}
            type="button"
          />
        ))}
        <label className="viz-faces__custom">
          <input
            aria-label="Custom face colour"
            disabled={count === 0}
            onChange={(event) => onPaint(event.target.value)}
            type="color"
            value={colour ?? '#8b8d98'}
          />
        </label>
      </fieldset>
      <button
        className="viz-faces__clear"
        disabled={count === 0 || !coloured}
        onClick={() => onPaint(null)}
        type="button"
      >
        Use the body's colour
      </button>
    </section>
  );
}
