/**
 * Which folder a dragged card is over, and which one is open for it. Folders are marked with
 * `data-drop-folder` ("" is All Projects) and an open folder's slot with `data-landing`
 * (`FolderDropTray.tsx`). Opening and closing are delayed so passing over a folder does nothing.
 */

/**
 * Hover time before a folder opens. Opening pushes the rows below down; at 90 ms a folder being
 * crossed opened and moved the target.
 */
const OPEN_DELAY_MS = 220;
/** Delay before a left folder closes, so a row moving under a still pointer does not flicker. */
const CLOSE_DELAY_MS = 160;

export interface Target {
  id: string | null;
  element: HTMLElement;
}

function folderAt(x: number, y: number): Target | null {
  const found = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-folder]');
  if (found === null || found === undefined) return null;
  const id = found.dataset.dropFolder ?? '';
  return { id: id === '' ? null : id, element: found };
}

export class FolderHover {
  /** The folder under the pointer. */
  hovered: Target | null = null;
  /** The folder open for the card. */
  open: Target | null = null;
  readonly #onTarget: (folder: string | null | undefined) => void;
  #openTimer = 0;
  #closeTimer = 0;

  constructor(onTarget: (folder: string | null | undefined) => void) {
    this.#onTarget = onTarget;
  }

  /** The slot the open folder keeps for the card, or null. */
  landing(): DOMRect | null {
    return (
      this.open?.element.querySelector<HTMLElement>('[data-landing]')?.getBoundingClientRect() ??
      null
    );
  }

  setOpen(next: Target | null): void {
    if (next?.element === this.open?.element) return;
    this.open = next;
    this.#onTarget(next === null ? undefined : next.id);
  }

  /** Tracks the folder under (`x`, `y`), opening and closing with a delay. */
  follow(x: number, y: number): void {
    const next = folderAt(x, y);
    if (next?.element === this.hovered?.element) return;
    this.hovered = next;
    window.clearTimeout(this.#openTimer);
    if (next !== null && next.element === this.open?.element) {
      window.clearTimeout(this.#closeTimer);
      return;
    }
    if (next !== null) {
      this.#openTimer = window.setTimeout(() => {
        window.clearTimeout(this.#closeTimer);
        this.setOpen(next);
      }, OPEN_DELAY_MS);
    }
    if (this.open !== null) {
      window.clearTimeout(this.#closeTimer);
      this.#closeTimer = window.setTimeout(() => {
        if (this.hovered?.element !== this.open?.element) this.setOpen(null);
      }, CLOSE_DELAY_MS);
    }
  }

  dispose(): void {
    window.clearTimeout(this.#openTimer);
    window.clearTimeout(this.#closeTimer);
  }
}
