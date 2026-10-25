/**
 * Tracks the display's pixel density while the app runs, so the drawing buffer follows a move to a
 * monitor with another scale or a system scale change. Verified only with Chromium emulation.
 */

/**
 * Calls `onChange` with the new `devicePixelRatio` each time it changes; returns the unsubscribe.
 */
export function watchPixelDensity(onChange: (ratio: number) => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  let query: MediaQueryList | null = null;
  // A resolution query matches one density only, so it is asked again for each new one.
  function listen(): void {
    query?.removeEventListener('change', changed);
    query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    query.addEventListener('change', changed);
  }
  function changed(): void {
    listen();
    onChange(devicePixelRatio);
  }
  listen();
  return () => query?.removeEventListener('change', changed);
}
