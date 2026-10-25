/**
 * Validation of wiki submissions: the article rules (format/article.ts), the shared text filter,
 * and each picture's type sniffed from its first bytes. Only PNG, JPEG and WebP are accepted;
 * SVG is refused because it can carry script.
 */

import { checkText } from '../../server/text-filter.js';
import {
  type DocArea,
  type DocArticle,
  IMAGE_KEY_PATTERN,
  isArrow,
  LIMITS,
  pictureMismatch,
  problemWith,
} from '../format/article.js';
import type { SentImage } from './store.js';

export class Refused extends Error {}

export interface Submitted {
  article: Omit<DocArticle, 'images' | 'author' | 'updatedAt'>;
  images: Record<string, SentImage>;
}

function mimeOf(bytes: Uint8Array): SentImage['mime'] | null {
  const at = (index: number) => bytes[index] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  )
    return 'image/webp';
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Parses a raw submission (JSON with base64 pictures) for the store. Throws `Refused` with a
 * user-facing message.
 */
export function readSubmission(raw: unknown, blocklist: readonly string[]): Submitted {
  if (!isRecord(raw) || !isRecord(raw.article)) throw new Refused('That is not an article.');
  const a = raw.article;
  const sent = isRecord(raw.images) ? raw.images : {};
  const images: Record<string, SentImage> = {};
  const held: Record<string, { src: string; alt: string; arrows: readonly never[] }> = {};

  for (const [key, value] of Object.entries(sent)) {
    if (!IMAGE_KEY_PATTERN.test(key))
      throw new Refused('A picture’s name is lower-case letters, digits and hyphens.');
    if (!isRecord(value) || typeof value.data !== 'string')
      throw new Refused(`The picture “${key}” did not arrive.`);
    const bytes = new Uint8Array(Buffer.from(value.data, 'base64'));
    if (bytes.byteLength === 0 || bytes.byteLength > LIMITS.imageBytes)
      throw new Refused(
        `A picture may be at most ${Math.round(LIMITS.imageBytes / 1_000_000)} MB (“${key}”).`,
      );
    const mime = mimeOf(bytes);
    if (mime === null) throw new Refused(`“${key}” is not a PNG, JPEG or WebP picture.`);
    const arrows = Array.isArray(value.arrows) ? value.arrows : [];
    if (arrows.length > LIMITS.arrowsPerImage || !arrows.every(isArrow))
      throw new Refused(`The arrows on “${key}” are not valid.`);
    const alt = typeof value.alt === 'string' ? value.alt : '';
    images[key] = { bytes, mime, alt, arrows };
    held[key] = { src: '', alt, arrows: [] as never[] };
  }

  const article = {
    id: String(a.id ?? ''),
    title: String(a.title ?? '').trim(),
    area: String(a.area ?? '') as DocArea,
    summary: String(a.summary ?? '').trim(),
    keywords: String(a.keywords ?? '')
      .toLowerCase()
      .trim(),
    body: String(a.body ?? '').replace(/\r\n?/g, '\n'),
  };
  const problem = problemWith({ ...article, images: held });
  if (problem !== null) throw new Refused(problem);

  const { missing, unused } = pictureMismatch({ body: article.body, images: held });
  if (missing.length > 0)
    throw new Refused(`The text shows the picture “${missing[0]}”, which was not sent.`);
  if (unused.length > 0)
    throw new Refused(`The picture “${unused[0]}” is not used in the text. Remove it or show it.`);

  for (const [field, text] of [
    ['title', article.title],
    ['summary', article.summary],
    ['words to find it by', article.keywords],
    ['article', article.body],
  ] as const) {
    const refusal = checkText(text, blocklist, field);
    if (refusal !== null) throw new Refused(refusal);
  }
  for (const [key, image] of Object.entries(images)) {
    const refusal = checkText(image.alt, blocklist, `description of “${key}”`);
    if (refusal !== null) throw new Refused(refusal);
  }
  return { article, images };
}
