/**
 * The UI for a screenshot-driven assistant: every on-screen control with its accessible name,
 * bounds and state. Models locate controls by name far better than by estimating from a picture,
 * so this reads the page as assistive technology does and returns rectangles in CSS pixels of the
 * window (screen pixels via the device pixel ratio and window position).
 */

const CONTROLS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="radio"]',
  '[role="option"]',
  '[role="treeitem"]',
  '[contenteditable="true"]',
].join(',');

/** Enough for any Bezier screen; beyond this it is a list, and its first rows suffice. */
const MAX = 400;

export interface UiElement {
  i: number;
  role: string;
  name: string;
  /** x, y, width, height in CSS pixels. */
  rect: [number, number, number, number];
  /** The labelled region containing it: "Items", "Settings", a dialog's name. */
  in?: string;
  key?: string;
  value?: string;
  disabled?: true;
  pressed?: boolean;
  expanded?: boolean;
  selected?: boolean;
}

export function uiMap(filter: string) {
  const wanted = filter.trim().toLowerCase();
  const elements: UiElement[] = [];
  for (const node of document.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (elements.length >= MAX) break;
    if (!visible(node)) continue;
    const name = nameOf(node);
    if (wanted !== '' && !name.toLowerCase().includes(wanted)) continue;
    const box = node.getBoundingClientRect();
    const element: UiElement = {
      i: elements.length + 1,
      role: node.getAttribute('role') ?? implicitRole(node),
      name,
      rect: [box.x, box.y, box.width, box.height].map(Math.round) as UiElement['rect'],
    };
    const region = regionOf(node);
    if (region !== null) element.in = region;
    const key = node.getAttribute('aria-keyshortcuts') ?? node.querySelector('kbd')?.textContent;
    if (key) element.key = key;
    if (
      node instanceof HTMLInputElement ||
      node instanceof HTMLSelectElement ||
      node instanceof HTMLTextAreaElement
    ) {
      element.value =
        node instanceof HTMLInputElement && (node.type === 'checkbox' || node.type === 'radio')
          ? String(node.checked)
          : node.value.slice(0, 80);
    }
    if (node.matches(':disabled, [aria-disabled="true"]')) element.disabled = true;
    const pressed = node.getAttribute('aria-pressed') ?? node.getAttribute('aria-checked');
    if (pressed !== null) element.pressed = pressed === 'true';
    const expanded = node.getAttribute('aria-expanded');
    if (expanded !== null) element.expanded = expanded === 'true';
    const selected = node.getAttribute('aria-selected');
    if (selected !== null) element.selected = selected === 'true';
    elements.push(element);
  }
  const dialog = document.querySelector('[role="dialog"], dialog[open]');
  return {
    window: {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
      // The page's position on screen, for converting to screen pixels. Browsers report the
      // window's outer corner; the title bar and toolbars sit between it and the page.
      screen: { x: screenX, y: screenY, chromeTop: outerHeight - innerHeight },
    },
    dialog: dialog === null ? null : (dialog.getAttribute('aria-label') ?? 'untitled'),
    elements,
    truncated: elements.length >= MAX,
  };
}

function visible(node: HTMLElement): boolean {
  const box = node.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return false;
  if (box.bottom < 0 || box.right < 0 || box.top > innerHeight || box.left > innerWidth)
    return false;
  if (node.closest('[hidden], [aria-hidden="true"], [inert]') !== null) return false;
  const style = getComputedStyle(node);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
}

function nameOf(node: HTMLElement): string {
  const labelled = node.getAttribute('aria-labelledby');
  const byId = labelled
    ?.split(' ')
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim();
  const label =
    node.getAttribute('aria-label') ??
    (byId || null) ??
    (node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent : null) ??
    node.closest('label')?.textContent ??
    node.getAttribute('title') ??
    node.textContent ??
    node.getAttribute('placeholder') ??
    '';
  return label.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function implicitRole(node: HTMLElement): string {
  if (node instanceof HTMLAnchorElement) return 'link';
  if (node instanceof HTMLSelectElement) return 'combobox';
  if (node instanceof HTMLTextAreaElement) return 'textbox';
  if (node instanceof HTMLInputElement) {
    if (node.type === 'checkbox') return 'checkbox';
    if (node.type === 'radio') return 'radio';
    if (node.type === 'range') return 'slider';
    return 'textbox';
  }
  return node.tagName === 'BUTTON' ? 'button' : 'generic';
}

function regionOf(node: HTMLElement): string | null {
  const region = node.parentElement?.closest<HTMLElement>(
    '[role="dialog"], dialog, [role="toolbar"], [role="menu"], nav, aside, section[aria-label], [role="region"]',
  );
  return region?.getAttribute('aria-label') ?? null;
}
