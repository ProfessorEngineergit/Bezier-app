/**
 * The intro film shown on first launch. Release builds bundle it (`public/film/intro.mp4`, 21 MB)
 * so it plays offline; `VITE_FILM_URL` at build or `bezier.film.url` in storage override the
 * address. A film that cannot load or play never blocks the app.
 */

const SEEN = 'bezier.film.seen';
const REPLAY = 'bezier:film-replay';
/** Dispatched when the film ends or is skipped, so the introduction can start. */
export const FILM_DONE = 'bezier:film-done';

/** The film's address; empty means there is no film. */
export function filmUrl(): string {
  try {
    const fromStorage = window.localStorage.getItem('bezier.film.url');
    if (fromStorage !== null && fromStorage !== '') return fromStorage;
  } catch {
    // Without storage, the build's address.
  }
  try {
    // Browser tests of a built app mark themselves; none are about the film.
    if (window.localStorage.getItem('bezier.e2e') === '1') return '';
  } catch {
    // Not marked.
  }
  const env = (import.meta as ImportMeta & { env?: { VITE_FILM_URL?: string; PROD?: boolean } })
    .env;
  // The dev server has no film; the one in `public/` is for builds.
  return env?.VITE_FILM_URL ?? (env?.PROD === true ? '/film/intro.mp4' : '');
}

/**
 * Film files to try, best first. Builds carry H.264/AAC (`.mp4`, hardware-decoded on Mac and
 * Windows) and VP9/Opus (`.webm`, the only pair Linux distributions like Fedora play by default:
 * no AAC decoder, and openh264 reads only the baseline profile). Each desktop build carries only
 * its own (vite.config.ts); the other is still tried for the web build, which has both.
 */
export function filmSources(url: string, served: string | null = null): string[] {
  if (!url.endsWith('/film/intro.mp4')) return url === '' ? [] : [url];
  const webm = url.replace(/\.mp4$/, '.webm');
  const linux = /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
  // The Linux and Windows apps serve the film file on loopback with byte ranges (`film.rs`).
  // WebKitGTK cannot play WebM from a blob or from Tauri's asset protocol, and WebView2 fails on
  // files served without byte ranges (shows 0:00 of 0:00 and closes).
  if (served !== null) return [served, ...(linux ? [webm, url] : [url, webm])];
  return linux ? [webm, url] : [url, webm];
}

/** The film's address in the Linux and Windows apps, set before the page loads (`main.rs`). */
export function servedFilm(): string | null {
  const said = (globalThis as { __bezierFilm?: unknown }).__bezierFilm;
  return typeof said === 'string' && said.startsWith('http://127.0.0.1:') ? said : null;
}

export function filmSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN) !== null;
  } catch {
    // Unknown counts as seen: showing the film on every start is worse than missing it.
    return true;
  }
}

export function markFilmSeen(): void {
  try {
    window.localStorage.setItem(SEEN, new Date().toISOString());
  } catch {
    // Shown again next time.
  }
}

/** Replays the film from a menu: the same overlay, with Skip enabled. */
export function replayFilm(): void {
  window.dispatchEvent(new Event(REPLAY));
}

export const REPLAY_EVENT = REPLAY;
