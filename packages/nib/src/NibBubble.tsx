/**
 * Nib's speech bubble with answer buttons. A live region, so screen readers announce it.
 * Positioning is done by the companion.
 */

import { forwardRef } from 'react';
import type { Bubble } from './controller.js';

interface Props {
  bubble: Bubble;
  /** Closing means "not now". */
  onClose: () => void;
}

export const NibBubble = forwardRef<HTMLDivElement, Props>(function NibBubble(
  { bubble, onClose },
  ref,
) {
  return (
    <div className="nib-bubble" key={bubble.key} ref={ref} role="status">
      <p className="nib-bubble__text">{bubble.text}</p>
      <div className="nib-bubble__row">
        {bubble.options.map((option, i) => (
          <button
            className={
              i === 0 ? 'nib-bubble__button nib-bubble__button--first' : 'nib-bubble__button'
            }
            key={option.label}
            onClick={option.run}
            type="button"
          >
            {option.label}
          </button>
        ))}
        <button aria-label="Close" className="nib-bubble__close" onClick={onClose} type="button">
          ×
        </button>
      </div>
    </div>
  );
});
