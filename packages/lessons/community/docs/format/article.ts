/**
 * A docs article: title, area and a Markdown body. The same shape is used for built-in articles,
 * submissions and articles served by a store.
 *
 * The body references pictures by key (`![](image:wire)`); the article holds them with their
 * arrows. Arrows are stored as coordinates, not drawn into the image, so they scale and stay
 * editable.
 */

export const DOC_AREAS = [
  'Getting around',
  'Sketch',
  'Modeling',
  'View',
  'Edit',
  'Workspaces',
  'Files',
  'Learn and Community',
  'Settings',
] as const;

export type DocArea = (typeof DOC_AREAS)[number];

/** From (x1, y1) to the head at (x2, y2), in 0 to 1 of the picture's width and height. */
export interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DocImage {
  /** An app path, or a URL on the store that holds the article. */
  src: string;
  /** Alt text, also shown as the caption. */
  alt: string;
  arrows: readonly Arrow[];
}

export interface DocArticle {
  /** Used in links and picture names: lower case, digits and hyphens. */
  id: string;
  title: string;
  area: DocArea;
  /** One sentence describing the article. */
  summary: string;
  /** Extra search terms, lower case and space separated. */
  keywords: string;
  /** Markdown (format/markdown.ts). */
  body: string;
  images: Readonly<Record<string, DocImage>>;
  /** Author, for store articles only. */
  author?: string;
  /** ISO 8601, for store articles only. */
  updatedAt?: string;
}

export const LIMITS = {
  title: 120,
  summary: 300,
  keywords: 300,
  body: 60_000,
  images: 12,
  arrowsPerImage: 12,
  /** Maximum bytes per picture as sent. */
  imageBytes: 1_500_000,
  idLength: 60,
} as const;

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const IMAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}$/;

const isNumber01 = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export function isArrow(value: unknown): value is Arrow {
  if (value === null || typeof value !== 'object') return false;
  const arrow = value as Partial<Arrow>;
  return (
    isNumber01(arrow.x1) && isNumber01(arrow.y1) && isNumber01(arrow.x2) && isNumber01(arrow.y2)
  );
}

/** A one-sentence reason the article is invalid, or null. Used by the editor and the store. */
export function problemWith(article: Partial<DocArticle>): string | null {
  const text = (value: unknown, max: number): value is string =>
    typeof value === 'string' && value.length <= max;
  if (
    typeof article.id !== 'string' ||
    !ID_PATTERN.test(article.id) ||
    article.id.length > LIMITS.idLength
  )
    return 'The address of an article is lower-case letters, digits and hyphens.';
  if (!text(article.title, LIMITS.title) || article.title.trim() === '')
    return `Give the article a title of at most ${LIMITS.title} characters.`;
  if (!DOC_AREAS.includes(article.area as DocArea)) return 'Choose which area the article is in.';
  if (!text(article.summary, LIMITS.summary) || article.summary.trim() === '')
    return `Say in one sentence, at most ${LIMITS.summary} characters, what the article is for.`;
  if (!text(article.keywords, LIMITS.keywords)) return 'The words to find it by are too long.';
  if (!text(article.body, LIMITS.body) || article.body.trim() === '')
    return `Write the article, at most ${LIMITS.body} characters.`;
  const images = article.images ?? {};
  const keys = Object.keys(images);
  if (keys.length > LIMITS.images) return `An article holds at most ${LIMITS.images} pictures.`;
  for (const key of keys) {
    const image = images[key];
    if (!IMAGE_KEY_PATTERN.test(key))
      return 'A picture’s name is lower-case letters, digits and hyphens.';
    if (image === undefined || typeof image.alt !== 'string' || image.alt.length > 200)
      return 'Say in a few words what each picture shows.';
    if (!Array.isArray(image.arrows) || image.arrows.length > LIMITS.arrowsPerImage)
      return `A picture carries at most ${LIMITS.arrowsPerImage} arrows.`;
    if (!image.arrows.every(isArrow)) return 'An arrow has to lie on its picture.';
  }
  return null;
}

/** Pictures referenced but missing, and pictures held but unused. */
export function pictureMismatch(article: Pick<DocArticle, 'body' | 'images'>): {
  missing: string[];
  unused: string[];
} {
  const used = [...article.body.matchAll(/!\[[^\]]*\]\(image:([a-z0-9-]+)\)/g)].map(
    (m) => m[1] ?? '',
  );
  const held = Object.keys(article.images);
  return {
    missing: [...new Set(used.filter((key) => !held.includes(key)))],
    unused: held.filter((key) => !used.includes(key)),
  };
}
