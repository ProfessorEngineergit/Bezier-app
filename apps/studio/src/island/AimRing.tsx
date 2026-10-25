/**
 * Ring around a lesson step's target when the step is shown in the title bar; on pages the figure
 * draws its own (same look, `nib.css`). Positioned by transform in a frame loop; the target is
 * re-queried a few times a second because sliding panels move it.
 */

import { grown, resolve, type Target } from '@bezier/nib';
import { useEffect, useRef } from 'react';
import { setStyle } from '../dom-writes.js';

export function AimRing({ aim }: { aim: Target | null }) {
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const marker = ring.current;
    if (aim === null || marker === null) return;
    let frame = 0;
    let element: Element | null = null;
    let looked = -Infinity;
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
      if (ms - looked > 250) {
        looked = ms;
        element = resolve(aim);
      }
      const r = element?.getBoundingClientRect();
      if (r === undefined || r.width <= 0) {
        setStyle(marker, 'opacity', '0');
        return;
      }
      const g = grown({ left: r.left, top: r.top, width: r.width, height: r.height }, 6);
      setStyle(marker, 'transform', `translate3d(${g.left}px, ${g.top}px, 0)`);
      setStyle(marker, 'width', `${g.width}px`);
      setStyle(marker, 'height', `${g.height}px`);
      setStyle(marker, 'opacity', '1');
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [aim]);
  return <div aria-hidden="true" className="nib-ring" hidden={aim === null} ref={ring} />;
}
