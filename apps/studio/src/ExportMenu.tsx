/**
 * The export format picker. Each row states what the format keeps or loses (STL drops every
 * curve), so the format is always an explicit choice.
 */

import { useEffect, useState } from 'react';
import { MESH_QUALITIES, type MeshQuality, meshQuality, setMeshQuality } from './mesh-quality.js';
import type { ExportFormat } from './use-export.js';
import { EXPORT_FORMATS } from './use-export.js';

export interface ExportMenuProps {
  onPick: (format: ExportFormat, onlySelected: boolean) => void;
  onClose: () => void;
  /** Number of bodies picked in the model; when nonzero, exporting just those is offered. */
  selectedBodies?: number;
  /** Whether a sketch is open or selected, which DXF and SVG write. */
  hasSketch?: boolean;
}

export function ExportMenu({
  onPick,
  onClose,
  selectedBodies = 0,
  hasSketch = false,
}: ExportMenuProps) {
  const [onlySelected, setOnlySelected] = useState(true);
  const [quality, setQuality] = useState<MeshQuality>(meshQuality);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <>
      <button aria-label="Close menu" className="menu__scrim" onClick={onClose} type="button" />
      <div className="menu menu--wide" role="menu">
        {selectedBodies > 0 && (
          <label className="menu__item menu__check">
            <input
              checked={onlySelected}
              onChange={(event) => setOnlySelected(event.target.checked)}
              type="checkbox"
            />
            {selectedBodies === 1
              ? 'Only the selected body'
              : `Only the ${selectedBodies} selected bodies`}
          </label>
        )}
        {/* STL and 3MF resolution: the maximum distance a triangle may deviate from the true
            surface. */}
        <p aria-hidden="true" className="menu__segmentsLabel">
          Mesh for STL and 3MF
        </p>
        <fieldset aria-label="Mesh quality for STL and 3MF" className="menu__segments">
          {(Object.keys(MESH_QUALITIES) as MeshQuality[]).map((key) => (
            <button
              aria-pressed={quality === key}
              key={key}
              onClick={() => {
                setQuality(key);
                setMeshQuality(key);
              }}
              title={`Triangles within ${MESH_QUALITIES[key].linearDeflection} mm of the surface`}
              type="button"
            >
              {MESH_QUALITIES[key].label}
            </button>
          ))}
        </fieldset>
        {EXPORT_FORMATS.map((format) => (
          <button
            className="menu__item menu__item--stacked"
            disabled={format.of === 'sketch' && !hasSketch}
            key={format.id}
            onClick={() => {
              onPick(format.id, selectedBodies > 0 && onlySelected);
              onClose();
            }}
            role="menuitem"
            type="button"
          >
            <span className="menu__itemLabel">{format.label}</span>
            <span className="menu__itemNote">
              {format.of === 'sketch' && !hasSketch
                ? 'Open or select a sketch to write it as a drawing.'
                : format.note}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
