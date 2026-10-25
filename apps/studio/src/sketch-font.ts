/**
 * Fonts for sketch text (public/fonts, SIL Open Font License): Archivo, the app's drawing font, and
 * Noto Sans, Serif and Mono, which cover Greek and Cyrillic. Fetched on first use and cached. Noto
 * Sans is the fallback for missing characters.
 */

import { type Font, parseFont } from '@bezier/ui';

export const SKETCH_FONTS = {
  Archivo: 'archivo-pdf-regular.ttf',
  'Noto Sans': 'NotoSans-Regular.ttf',
  'Noto Serif': 'NotoSerif-Regular.ttf',
  'Noto Sans Mono': 'NotoSansMono-Regular.ttf',
} as const;

export type SketchFontName = keyof typeof SKETCH_FONTS;

const loading = new Map<SketchFontName, Promise<Font>>();

export function sketchFont(name: SketchFontName = 'Archivo'): Promise<Font> {
  const known = loading.get(name);
  if (known !== undefined) return known;
  const pending = fetch(`${import.meta.env.BASE_URL}fonts/${SKETCH_FONTS[name]}`)
    .then((response) => {
      if (!response.ok) throw new Error(`The font ${name} could not be loaded.`);
      return response.arrayBuffer();
    })
    .then(parseFont)
    .catch((error: unknown) => {
      loading.delete(name);
      throw error;
    });
  loading.set(name, pending);
  return pending;
}
