/**
 * Arrow editor for a picture. Drag on the picture to draw an arrow, drag an end to move it, drag a
 * line to move the whole arrow; Delete removes the selected one. The picture itself is unchanged.
 */

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../ui/Dialog.js';
import { hitTest, isLongEnough, moveEnd, shift } from '../format/arrows.js';
import { type Arrow, LIMITS } from '../format/article.js';
import { ArrowShapes } from './AnnotatedImage.js';

type Drag =
  | { kind: 'draw'; from: { x: number; y: number } }
  | { kind: 'end'; index: number; end: 'tail' | 'head' }
  | { kind: 'move'; index: number; last: { x: number; y: number } };

export function ArrowEditor({
  src,
  alt,
  arrows: initial,
  onDone,
  onCancel,
}: {
  src: string;
  alt: string;
  arrows: readonly Arrow[];
  onDone: (arrows: readonly Arrow[]) => void;
  onCancel: () => void;
}) {
  const [arrows, setArrows] = useState<readonly Arrow[]>(initial);
  const [picked, setPicked] = useState<number | null>(null);
  const [ratio, setRatio] = useState(1.6);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  /** The latest arrows, read when a press ends. */
  const latest = useRef(arrows);
  latest.current = arrows;

  const remove = () => {
    if (picked === null) return;
    setArrows((all) => all.filter((_, index) => index !== picked));
    setPicked(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && picked !== null) {
        event.preventDefault();
        remove();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const where = (event: React.PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return null;
    return {
      point: {
        x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
        y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
      },
      size: { width: box.width, height: box.height },
    };
  };

  function down(event: React.PointerEvent) {
    const here = where(event);
    if (here === null || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const hit = hitTest(arrows, here.point, here.size);
    if (hit.kind === 'head' || hit.kind === 'tail') {
      drag.current = { kind: 'end', index: hit.index, end: hit.kind };
      setPicked(hit.index);
    } else if (hit.kind === 'line') {
      drag.current = { kind: 'move', index: hit.index, last: here.point };
      setPicked(hit.index);
    } else if (arrows.length < LIMITS.arrowsPerImage) {
      drag.current = { kind: 'draw', from: here.point };
      setPicked(arrows.length);
      setArrows((all) => [
        ...all,
        { x1: here.point.x, y1: here.point.y, x2: here.point.x, y2: here.point.y },
      ]);
    } else setPicked(null);
  }

  function move(event: React.PointerEvent) {
    const current = drag.current;
    const here = where(event);
    if (current === null || here === null) return;
    setArrows((all) =>
      all.map((arrow, index) => {
        if (current.kind === 'draw' && index === all.length - 1)
          return { ...arrow, x2: here.point.x, y2: here.point.y };
        if (current.kind === 'end' && index === current.index)
          return moveEnd(arrow, current.end, here.point);
        if (current.kind === 'move' && index === current.index) {
          const next = shift(arrow, here.point.x - current.last.x, here.point.y - current.last.y);
          current.last = here.point;
          return next;
        }
        return arrow;
      }),
    );
  }

  function up(event: React.PointerEvent) {
    const current = drag.current;
    drag.current = null;
    const here = where(event);
    if (current?.kind === 'draw' && here !== null) {
      // Discard arrows too short to count (a plain click).
      const last = latest.current.at(-1);
      const kept = last !== undefined && isLongEnough(last, here.size);
      if (!kept) setArrows((all) => all.slice(0, -1));
      if (!kept) setPicked(null);
    }
  }

  return (
    <Dialog onClose={onCancel} title="Arrows on the picture" wide>
      <div className="doc-arrows">
        <p className="doc-arrows__help">
          Drag on the picture to draw an arrow. Drag an end to move it, or the line to move the
          whole arrow. Press Delete to remove the one you picked.
        </p>
        <div
          className="doc-arrows__frame"
          onPointerCancel={up}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          ref={frame}
        >
          <img
            alt={alt}
            className="doc-figure__picture"
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
            }}
            src={src}
          />
          <svg
            aria-hidden="true"
            className="doc-figure__arrows"
            preserveAspectRatio="none"
            viewBox="0 0 1 1"
          >
            <ArrowShapes arrows={arrows} ratio={ratio} />
          </svg>
          {/* End handles are drawn in pixels outside the stretched SVG, so circles stay round. */}
          {arrows.map((arrow, index) => (
            <span
              className="doc-arrows__handles"
              data-picked={picked === index ? '' : undefined}
              // biome-ignore lint/suspicious/noArrayIndexKey: arrows are identified by order
              key={index}
            >
              <span
                className="doc-arrows__dot"
                style={{ left: `${arrow.x1 * 100}%`, top: `${arrow.y1 * 100}%` }}
              />
              <span
                className="doc-arrows__dot doc-arrows__dot--head"
                style={{ left: `${arrow.x2 * 100}%`, top: `${arrow.y2 * 100}%` }}
              />
            </span>
          ))}
        </div>
        <div className="doc-arrows__bar">
          <span className="doc-arrows__count">
            {arrows.length === 0
              ? 'No arrows'
              : `${arrows.length} of ${LIMITS.arrowsPerImage} arrows`}
          </span>
          <button
            className="lessons-button"
            disabled={picked === null}
            onClick={remove}
            type="button"
          >
            Delete arrow
          </button>
          <button
            className="lessons-button"
            disabled={arrows.length === 0}
            onClick={() => {
              setArrows([]);
              setPicked(null);
            }}
            type="button"
          >
            Clear
          </button>
          <span className="doc-arrows__gap" />
          <button className="lessons-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="lessons-button lessons-button--primary"
            onClick={() => onDone(arrows)}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </Dialog>
  );
}
