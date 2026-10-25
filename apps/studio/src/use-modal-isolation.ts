import { type RefObject, useEffect } from 'react';

/**
 * Makes everything behind a modal inert. Walks from the modal's root up to `document.body` and
 * inerts every sibling on the way, so it works wherever the modal is opened from (`ConfirmDialog`
 * opens from both the dashboard and inside a project) rather than relying on page-specific
 * selectors.
 */
export function useModalIsolation(modalRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const modal = modalRef.current;
    if (modal === null) return;

    const restore: (() => void)[] = [];
    let node: HTMLElement | null = modal;
    while (node !== null && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (parent === null) break;
      for (const sibling of parent.children) {
        if (sibling === node || !(sibling instanceof HTMLElement)) continue;
        const wasInert = sibling.inert;
        const ariaHidden = sibling.getAttribute('aria-hidden');
        sibling.inert = true;
        sibling.setAttribute('aria-hidden', 'true');
        restore.push(() => {
          sibling.inert = wasInert;
          if (ariaHidden === null) sibling.removeAttribute('aria-hidden');
          else sibling.setAttribute('aria-hidden', ariaHidden);
        });
      }
      node = parent;
    }

    return () => {
      for (const undo of restore) undo();
    };
  }, [modalRef]);
}
