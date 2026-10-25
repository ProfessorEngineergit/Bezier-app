/**
 * What Nib looks or points at: a page element, named as a test would. A selector suffices for
 * unique classes; since many editor buttons share a class, a target can also match by text.
 */

export type Target = string | { selector: string; text: string };

/** The first element the target matches, or null if it is not on the page. */
export function resolve(target: Target, root: ParentNode = document): Element | null {
  if (typeof target === 'string') return root.querySelector(target);
  for (const element of root.querySelectorAll(target.selector))
    if (element.textContent?.trim().startsWith(target.text) === true) return element;
  return null;
}

/** Whether the target is on the page and has a size; hidden elements are not pointed at. */
export function visible(target: Target, root: ParentNode = document): Element | null {
  const element = resolve(target, root);
  if (element === null) return null;
  const { width, height } = element.getBoundingClientRect();
  return width > 0 && height > 0 ? element : null;
}
