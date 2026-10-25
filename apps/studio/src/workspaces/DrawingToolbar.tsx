/** Drawing tools and a visible sheet creation action on a shared top alignment. */

import type { ReactNode } from 'react';

interface Props {
  /** Drawing sheets or physics drawings, first in the bar (`PhysicsDesk.tsx`). */
  kindToggle?: ReactNode;
  /**
   * A physics drawing is on show: its pictures are not views to dimension, cut or detail, nor
   * projected again, and it comes from Simulation and not from a blank sheet.
   */
  physics?: boolean;
  addSheet: () => void;
  dimensioning: boolean;
  toggleDimension: () => void;
  section: number | null;
  setSection: (change: (old: number | null) => number | null) => void;
  invalidate: () => void;
  hasViews: boolean;
  detailOn: boolean;
  toggleDetail: () => void;
  zoomBy: (factor: number) => void;
  percent: number;
  fit: () => void;
  loading: boolean;
  canUpdate: boolean;
  update: () => void;
  exportOpen: boolean;
  setExportOpen: (change: boolean | ((old: boolean) => boolean)) => void;
  save: (kind: 'pdf' | 'dxf') => void;
}
const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
} as const;
export function DrawingToolbar({
  dimensioning,
  addSheet,
  toggleDimension,
  section,
  setSection,
  invalidate,
  hasViews,
  detailOn,
  toggleDetail,
  zoomBy,
  percent,
  fit,
  loading,
  canUpdate,
  update,
  exportOpen,
  setExportOpen,
  save,
  kindToggle,
  physics = false,
}: Props) {
  return (
    <div className="dwg-top-tools">
      <div aria-label="Drawing tools" className="dwg-toolbar" role="toolbar">
        {kindToggle}
        {!physics && (
          <div className="dwg-toolbar__group">
            <button
              aria-label="Dimension"
              aria-pressed={dimensioning}
              onClick={toggleDimension}
              title="Dimension (D)"
              type="button"
            >
              <svg aria-hidden="true" {...ICON}>
                <path d="M2 4v8M14 4v8M2 8h12M4.5 6.2 2.6 8l1.9 1.8M11.5 6.2 13.4 8l-1.9 1.8" />
              </svg>
              <span className="dwg-toolbar__label">Dimension</span>
            </button>

            <button
              aria-label="Section"
              aria-pressed={section !== null}
              disabled={!hasViews && section === null}
              onClick={() => {
                setSection((s) => (s === null ? 0.5 : null));
                invalidate();
              }}
              title="Section view A–A"
              type="button"
            >
              <svg aria-hidden="true" {...ICON}>
                <rect height="10" rx="1" width="10" x="3" y="3" />
                <path d="M3 9l6-6M3 13 13 3M7 13l6-6" strokeWidth="1" />
              </svg>
              <span className="dwg-toolbar__label">Section</span>
            </button>
            <button
              aria-label="Detail"
              aria-pressed={detailOn}
              disabled={!hasViews}
              onClick={toggleDetail}
              title="Detail view B"
              type="button"
            >
              <svg aria-hidden="true" {...ICON}>
                <circle cx="7" cy="7" r="4.5" />
                <path d="m10.3 10.3 3.7 3.7" />
              </svg>
              <span className="dwg-toolbar__label">Detail</span>
            </button>
          </div>
        )}
        <div className="dwg-toolbar__group">
          <button
            aria-label="Zoom out"
            onClick={() => zoomBy(0.8)}
            title="Zoom out (−)"
            type="button"
          >
            −
          </button>
          <button
            aria-label="Fit sheet"
            className="dwg-zoom"
            onClick={fit}
            title="Fit sheet (F)"
            type="button"
          >
            {percent}%
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => zoomBy(1.25)}
            title="Zoom in (+)"
            type="button"
          >
            +
          </button>
        </div>
        <div className="dwg-toolbar__group">
          {!physics && (
            <>
              <button
                aria-label="Add sheet"
                title="New blank sheet · choose its items separately"
                onClick={addSheet}
                type="button"
              >
                + <span className="dwg-toolbar__label">Sheet</span>
              </button>
              <button
                aria-label="Update from model"
                disabled={!canUpdate || loading}
                onClick={update}
                title="Project the model again"
                type="button"
              >
                <svg aria-hidden="true" {...ICON}>
                  <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
                </svg>
              </button>
            </>
          )}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: closes the menu when focus leaves it */}
          <div
            className="dwg-export"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setExportOpen(false);
            }}
          >
            <button
              aria-label="Export Sheet"
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              className="dwg-primary"
              disabled={!hasViews}
              onClick={() => setExportOpen((o) => !o)}
              type="button"
            >
              <svg aria-hidden="true" {...ICON}>
                <path d="M8 2v8m-3-3 3 3 3-3M3 11v3h10v-3" />
              </svg>
              <span className="dwg-toolbar__label">Export Sheet</span>
              <svg aria-hidden="true" {...ICON} height={10} width={10}>
                <path d="m4 6 4 4 4-4" strokeWidth="1.8" />
              </svg>
            </button>
            {exportOpen && (
              <div aria-label="Export" className="dwg-export__menu" role="menu">
                <button onClick={() => save('pdf')} role="menuitem" type="button">
                  <strong>PDF</strong>
                  <small>Vector, for print and review</small>
                </button>
                <button onClick={() => save('dxf')} role="menuitem" type="button">
                  <strong>DXF</strong>
                  <small>R2013, millimetres, for CAD and CAM</small>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
