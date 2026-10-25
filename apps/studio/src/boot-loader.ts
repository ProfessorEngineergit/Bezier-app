/**
 * The loading screen. The element lives in `index.html`, not React, so it shows before any script
 * runs; its CSS fade-in is delayed so a fast start never shows it. It tracks real work only (no
 * minimum duration). Nested calls are counted, so overlapping loads do not hide it early.
 */

/** How long the fade-out runs; kept in step with `boot-out` in index.html. */
const LEAVE_MS = 180;

/** The film frame shown when motion is reduced: the finished collar. */
const REDUCED_MOTION_FRAME = 21.8;

const hasDocument = typeof document !== 'undefined';

function overlay(): HTMLElement | null {
  return hasDocument ? document.getElementById('boot') : null;
}

function film(): HTMLVideoElement | null {
  return overlay()?.querySelector('video') ?? null;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Start from the beginning, or hold still on the finished part. */
function startFilm(): void {
  const video = film();
  if (video === null) return;
  if (prefersReducedMotion()) {
    video.pause();
    const hold = () => {
      video.currentTime = REDUCED_MOTION_FRAME;
    };
    if (video.readyState >= 1) hold();
    else video.addEventListener('loadedmetadata', hold, { once: true });
    return;
  }
  video.currentTime = 0;
  // A refused autoplay leaves the poster, which is the same picture.
  video.play().catch(() => undefined);
}

// The page starts with the overlay up for the cold start, which is already in progress here.
let depth = overlay()?.hidden === false ? 1 : 0;
let leaving: number | undefined;

if (depth > 0 && prefersReducedMotion()) startFilm();

/**
 * Starts a load. `belowBar` leaves the title bar uncovered so the user can leave a slow project
 * open. `immediate` shows the screen without the fade-in delay.
 */
export function beginLoading(options: { belowBar?: boolean; immediate?: boolean } = {}): void {
  depth += 1;
  const element = overlay();
  if (element === null) return;
  if (depth === 1) {
    element.toggleAttribute('data-below-bar', options.belowBar === true);
    // The bar then only offers the way out (shell.css): a model that is not loaded has nothing to
    // switch, export or report on.
    document.documentElement.toggleAttribute('data-loading-below-bar', options.belowBar === true);
    // No fade-in delay, for a load whose caller has already waited.
    element.toggleAttribute('data-now', options.immediate === true);
  }
  if (leaving !== undefined) {
    window.clearTimeout(leaving);
    leaving = undefined;
  }
  if (depth > 1 && !element.hidden && element.dataset.state !== 'leaving') return;

  element.hidden = false;
  delete element.dataset.state;
  // Restart the delayed fade-in so a reopened loader waits again before showing.
  element.style.animation = 'none';
  void element.offsetWidth;
  element.style.animation = '';
  startFilm();
}

/**
 * Finishes once the browser has drawn the result. `finishLoading` alone hides the screen a frame or
 * more before React renders the result, which shows the editor assembling itself on large models.
 * Waits two frames: one for React to render, one for the browser to present it.
 */
export function finishLoadingAfterPaint(): void {
  // Hidden or minimised windows get no animation frames, so waiting for them would keep the screen
  // up indefinitely.
  if (!hasDocument || typeof requestAnimationFrame !== 'function' || document.hidden) {
    finishLoading();
    return;
  }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    finishLoading();
  };
  // Fallback for frames that stop coming (the window was hidden meanwhile).
  const timer = window.setTimeout(go, 2000);
  requestAnimationFrame(() => {
    requestAnimationFrame(go);
  });
}

/**
 * Hides the loading screen regardless of the count. Used when leaving to the start page, so an
 * abandoned or unfinished load does not cover it.
 */
export function endLoadingNow(): void {
  depth = 0;
  const element = overlay();
  if (leaving !== undefined) {
    window.clearTimeout(leaving);
    leaving = undefined;
  }
  if (element === null || element.hidden) return;
  element.hidden = true;
  delete element.dataset.state;
  element.removeAttribute('data-cold');
  document.documentElement.removeAttribute('data-loading-below-bar');
  document.getElementById('frame')?.setAttribute('hidden', '');
  film()?.pause();
}

/** The work begun by the matching `beginLoading` has finished, or failed. */
export function finishLoading(): void {
  depth = Math.max(0, depth - 1);
  if (depth > 0) return;
  const element = overlay();
  if (element === null || element.hidden) return;

  element.dataset.state = 'leaving';
  leaving = window.setTimeout(() => {
    leaving = undefined;
    if (depth > 0) return;
    element.hidden = true;
    delete element.dataset.state;
    document.documentElement.removeAttribute('data-loading-below-bar');
    // The cold start is over; later loads cover the window with their own background instead of the
    // `#frame` outline in index.html.
    element.removeAttribute('data-cold');
    document.getElementById('frame')?.setAttribute('hidden', '');
    film()?.pause();
  }, LEAVE_MS);
}
