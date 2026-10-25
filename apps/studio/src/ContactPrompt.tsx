/**
 * Asks, at the part itself, what to do after a part was made or moved into another: join, cut, or
 * keep separate (ADR 0012). Cut is offered only when the parts share volume.
 *
 * Follows the part while the view turns. The position is written to the element every frame, so
 * camera motion does not re-render React (ADR 0007).
 */

import type { StableRef } from '@bezier/core';
import { type RefObject, useEffect, useRef } from 'react';
import type { BodyContact } from './session.js';
import type { ViewportHandle } from './Viewport.js';
import './contact-prompt.css';
import { setStyle } from './dom-writes.js';

/** How far beside the face's middle the menu stands, in pixels, so the face stays clickable. */
const BESIDE = 28;

export function ContactPrompt({
  contacts,
  face,
  handleRef,
  onAnswer,
}: {
  contacts: readonly BodyContact[];
  /** The face of the part that was asked about; the menu stands at its middle. */
  face: StableRef | null;
  handleRef: RefObject<ViewportHandle | null>;
  onAnswer: (choice: 'join' | 'cut' | 'keep') => void;
}) {
  const root = useRef<HTMLElement | null>(null);
  const open = contacts.length > 0;
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      const element = root.current;
      const handle = handleRef.current;
      const at = face === null ? null : handle?.faceCentroid(face);
      const screen = at ? handle?.project(at.x, at.y, at.z) : null;
      if (element !== null) {
        // Off screen, the menu waits where notices appear.
        if (screen) {
          element.dataset.placed = '';
          setStyle(element, 'left', `${screen.x + BESIDE}px`);
          setStyle(element, 'top', `${screen.y + BESIDE}px`);
        } else {
          delete element.dataset.placed;
          setStyle(element, 'left', '');
          setStyle(element, 'top', '');
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onAnswer('keep');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, face, handleRef, onAnswer]);
  const [first] = contacts;
  if (first === undefined) return null;
  const others = contacts.map((item) => item.body.label).join(', ');
  const overlapping = contacts.some((item) => item.contact === 'overlapping');
  return (
    <section aria-label="Bodies meet" className="contact-prompt" ref={root} role="dialog">
      <p>
        {overlapping ? 'Reaches into' : 'Touches'} {others}
      </p>
      <div className="contact-prompt__actions">
        <button onClick={() => onAnswer('join')} type="button">
          Join
        </button>
        {overlapping && (
          <button onClick={() => onAnswer('cut')} type="button">
            Cut from {contacts.length === 1 ? others : 'them'}
          </button>
        )}
        <button onClick={() => onAnswer('keep')} type="button">
          New body
        </button>
      </div>
    </section>
  );
}
