/**
 * The user's docs token per store, stored locally and sent only to that store. Author tokens submit
 * for review; reviewer tokens publish and give access to the review queue.
 */

const key = (store: string) => `bezier-docs:token:${store}`;

export function savedToken(
  store: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): string {
  try {
    return storage.getItem(key(store)) ?? '';
  } catch {
    return '';
  }
}

export function saveToken(
  store: string,
  token: string,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  try {
    if (token.trim() === '') storage.removeItem(key(store));
    else storage.setItem(key(store), token.trim());
  } catch (error) {
    console.warn('Could not remember the docs token.', error);
  }
}
