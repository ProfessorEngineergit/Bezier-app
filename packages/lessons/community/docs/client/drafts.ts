/**
 * Local article drafts: the text and each picture's bytes and arrows. Nothing is sent until the
 * user submits.
 */

import type { DatabaseSpec } from '../../../src/store/database.js';
import { getAll, request, transact } from '../../../src/store/database.js';
import type { Arrow, DocArea } from '../format/article.js';

export const DOCS_DATABASE: DatabaseSpec = {
  name: 'bezier-docs',
  version: 1,
  stores: { drafts: { keyPath: 'id' } },
};

export interface DraftImage {
  bytes: Uint8Array;
  mime: string;
  alt: string;
  arrows: readonly Arrow[];
}

export interface Draft {
  /** The article id, also the draft's key. */
  id: string;
  title: string;
  area: DocArea;
  summary: string;
  keywords: string;
  body: string;
  images: Record<string, DraftImage>;
  updatedAt: string;
}

export const emptyDraft = (id = ''): Draft => ({
  id,
  title: '',
  area: 'Getting around',
  summary: '',
  keywords: '',
  body: '',
  images: {},
  updatedAt: new Date().toISOString(),
});

/** An article id from its title: lower case, hyphenated, within the store's length limit. */
export const idFromTitle = (title: string): string =>
  title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');

export const listDrafts = async (): Promise<Draft[]> =>
  (
    await transact(DOCS_DATABASE, 'drafts', 'readonly', (store) => getAll<Draft>(store('drafts')))
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const saveDraft = (draft: Draft): Promise<void> =>
  transact(DOCS_DATABASE, 'drafts', 'readwrite', (store) =>
    request(store('drafts').put({ ...draft, updatedAt: new Date().toISOString() })),
  ).then(() => undefined);

export const deleteDraft = (id: string): Promise<void> =>
  transact(DOCS_DATABASE, 'drafts', 'readwrite', (store) =>
    request(store('drafts').delete(id)),
  ).then(() => undefined);

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

/** The payload to send for a draft. */
export function outgoing(draft: Draft): import('./api.js').Outgoing {
  return {
    article: {
      id: draft.id,
      title: draft.title.trim(),
      area: draft.area,
      summary: draft.summary.trim(),
      keywords: draft.keywords.trim().toLowerCase(),
      body: draft.body,
    },
    images: Object.fromEntries(
      Object.entries(draft.images).map(([key, image]) => [
        key,
        { data: toBase64(image.bytes), alt: image.alt, arrows: image.arrows },
      ]),
    ),
  };
}
