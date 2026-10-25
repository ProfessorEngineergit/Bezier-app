/**
 * Suppresses browser behaviours CSS cannot turn off: the context menu ("Reload", "Inspect Element")
 * and native drag of labels, images and links. The context menu stays in text fields, where it
 * carries Cut/Copy/Paste. An app context menu should replace this suppression.
 */

/// <reference lib="dom" />

/** True for elements where the native context menu is wanted. */
function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** Installs the guards. Returns a teardown for tests. */
export function installNativeFeel(): () => void {
  const onContextMenu = (event: MouseEvent): void => {
    if (!editable(event.target)) event.preventDefault();
  };

  // Only explicit app drag sources may start a drag; anything else is the browser dragging an
  // image, link or text selection.
  const onDragStart = (event: DragEvent): void => {
    if (event.target instanceof Element && event.target.closest('[draggable="true"]') !== null) {
      return;
    }
    event.preventDefault();
  };

  // Focus rings only for keyboard navigation. A mouse-clicked button keeps focus, and the browser
  // would ring it on the next key of any kind (e.g. Space to square the view). The document records
  // the last input type; the ring shows (styles.css) only after Tab or an arrow key, until the
  // pointer is used again.
  const root = document.documentElement;
  const onPointer = (): void => {
    root.dataset.input = 'pointer';
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) root.dataset.input = 'keys';
  };

  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('pointerdown', onPointer, { capture: true });
  document.addEventListener('keydown', onKey, { capture: true });

  return () => {
    document.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('dragstart', onDragStart);
    document.removeEventListener('pointerdown', onPointer, { capture: true });
    document.removeEventListener('keydown', onKey, { capture: true });
  };
}
