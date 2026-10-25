// The icons as glass: thin lines that fade from solid at the top to clear at the bottom, a fine
// line of light along their upper edge, surfaces of frosted glass, and a soft shadow under it all.
// Nothing is drawn in hard black: the colour is the text colour, let through the glass.

const STROKE = 1.25;

/** The same drawing in the glass look. `id` keeps gradients apart when many sit on one page. */
export function glassSvg(inner, { id = 'g', size = 20 } = {}) {
  const body = inner
    // Surfaces: frosted glass, lit from the top left, instead of a flat tint.
    .replace(
      /fill="currentColor" fill-opacity="([\d.]+)" stroke="none"/g,
      (_, o) =>
        `fill="url(#${id}-f)" fill-opacity="${Math.min(1, +o * 2.2).toFixed(2)}" stroke="none"`,
    );
  // The highlight: the same lines again, thin and white, nudged up and left onto their lit edge.
  // Ghosts and axes get none: light on a line that is only a hint would make it look real.
  const light = body
    .replace(/fill="url\([^)]*\)"[^/]*?stroke="none"/g, 'fill="none" stroke="none"')
    .replace(/fill="currentColor"/g, 'fill="none"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke-linecap="round" stroke-linejoin="round">
<defs>
<linearGradient id="${id}-s" x1="0" y1="1" x2="0" y2="15" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="currentColor" stop-opacity="0.95"/><stop offset="1" stop-color="currentColor" stop-opacity="0.5"/></linearGradient>
<linearGradient id="${id}-f" x1="2" y1="1" x2="14" y2="15" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="currentColor" stop-opacity="0.55"/><stop offset="0.55" stop-color="currentColor" stop-opacity="0.22"/><stop offset="1" stop-color="currentColor" stop-opacity="0.1"/></linearGradient>
<filter id="${id}-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="0.6" stdDeviation="0.55" flood-color="#0b1220" flood-opacity="0.22"/></filter>
</defs>
<g filter="url(#${id}-sh)" stroke="url(#${id}-s)" stroke-width="${STROKE}" fill="none" style="color:inherit">${body.replace(/fill="currentColor"/g, `fill="url(#${id}-s)"`)}</g>
<g stroke="#fff" stroke-opacity="0.55" stroke-width="0.45" fill="none" transform="translate(-0.22 -0.32)">${light.replace(/stroke-opacity="[\d.]+"([^>]*)data-ghost=""/g, 'stroke-opacity="0"$1')}</g>
</svg>`;
}
