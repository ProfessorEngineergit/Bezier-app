/**
 * Per-frame DOM writes for labels and gizmos that skip unchanged values. Setting a style or
 * attribute, even to its current value, triggers a repaint, which dominates without GPU
 * acceleration (6 fps at rest in a Linux VM). The last value is cached per element, so steady state
 * allocates nothing.
 */

const written = new WeakMap<Element, Map<string, string>>();

function changed(element: Element, key: string, value: string): boolean {
  let values = written.get(element);
  if (values === undefined) {
    values = new Map();
    written.set(element, values);
  }
  if (values.get(key) === value) return false;
  values.set(key, value);
  return true;
}

/** Sets one style property (`left`, `transform`, a custom property) if it changed. */
export function setStyle(element: HTMLElement | SVGElement, property: string, value: string): void {
  if (changed(element, property, value)) element.style.setProperty(property, value);
}

/** Sets one attribute if it changed. */
export function setAttr(element: Element, name: string, value: string): void {
  if (changed(element, `@${name}`, value)) element.setAttribute(name, value);
}

/**
 * Rounds a screen position to whole pixels. WebKit without acceleration smears text placed at half
 * pixels by a transform across two.
 */
export function px(value: number): string {
  return `${String(Math.round(value))}px`;
}
