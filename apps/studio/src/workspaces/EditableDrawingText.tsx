/**
 * In-place drawing annotations; changes are paper annotations, never model constraints.
 *
 * The input is a page element over the text, not a `foreignObject`: inside a scaled sheet WebKit
 * draws those dark, misplaced and clipped at the view edge.
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function EditableDrawingText({
  value,
  label,
  x,
  y,
  size = 3.2,
  anchor = 'start',
  onChange,
}: {
  value: string;
  label: string;
  x: number;
  y: number;
  size?: number;
  anchor?: 'start' | 'middle';
  onChange: (text: string) => void;
}) {
  const [editing, setEditing] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState(value);
  const text = useRef<SVGTextElement>(null);
  const open = () => {
    setDraft(value);
    setEditing(text.current?.getBoundingClientRect() ?? null);
  };
  const finish = () => {
    onChange(draft.trim().slice(0, 160));
    setEditing(null);
  };
  return (
    <g data-drawing-control="">
      {/* biome-ignore lint/a11y/useSemanticElements: editable SVG text must remain a vector text element for PDF and DXF */}
      <text
        aria-label={`Edit ${label}`}
        role="button"
        tabIndex={0}
        className="dwg-editable-text"
        fill="#1f2830"
        stroke="none"
        fontSize={size}
        textAnchor={anchor}
        x={x}
        y={y}
        ref={text}
        onDoubleClick={(e) => {
          e.stopPropagation();
          open();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            open();
          }
        }}
      >
        {value || '—'}
      </text>
      {editing !== null &&
        createPortal(
          <form
            className="dwg-inline-editor"
            data-no-export=""
            onPointerDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              finish();
            }}
            style={{
              left: editing.left + (anchor === 'middle' ? editing.width / 2 - 60 : -4),
              top: editing.top + editing.height / 2 - 14,
            }}
          >
            <input
              aria-label={label}
              value={draft}
              ref={(el) => {
                if (el && document.activeElement !== el) {
                  el.focus();
                  el.select();
                }
              }}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finish}
              maxLength={160}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(null);
                }
              }}
            />
          </form>,
          document.body,
        )}
    </g>
  );
}
