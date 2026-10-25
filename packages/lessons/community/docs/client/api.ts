/** Client for the wiki API (server/http.ts). */

import type { Arrow, DocArea, DocArticle } from '../format/article.js';

type Fetch = typeof fetch;

export interface DocsSource {
  /** The store's docs endpoint, e.g. `https://community.example.org/docs`. */
  url: string;
  name: string;
}

export interface Page {
  articles: DocArticle[];
  next?: string;
}

/** A change to publish: the article plus each picture's bytes and arrows. */
export interface Outgoing {
  article: {
    id: string;
    title: string;
    area: DocArea;
    summary: string;
    keywords: string;
    body: string;
  };
  images: Record<string, { data: string; alt: string; arrows: readonly Arrow[] }>;
}

async function call(
  source: DocsSource,
  path: string,
  options: { token?: string; payload?: unknown; signal?: AbortSignal; fetchImpl?: Fetch } = {},
): Promise<unknown> {
  const { token, payload, signal, fetchImpl = fetch } = options;
  let response: Response;
  try {
    response = await fetchImpl(`${source.url}${path}`, {
      ...(signal === undefined ? {} : { signal }),
      ...(payload === undefined ? {} : { method: 'POST', body: JSON.stringify(payload) }),
      headers: {
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(`${source.name} did not answer. Check your connection and try again.`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const sentence = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof sentence === 'string' ? sentence : `${source.name} refused that.`);
  }
  return body;
}

/** Resolves server picture paths to loadable URLs. */
function resolve(source: DocsSource, article: DocArticle, picturePath = ''): DocArticle {
  return {
    ...article,
    images: Object.fromEntries(
      Object.entries(article.images).map(([key, image]) => [
        key,
        { ...image, src: `${source.url}${picturePath}${image.src}` },
      ]),
    ),
  };
}

export async function listDocs(
  source: DocsSource,
  query: { q?: string; cursor?: string },
  signal?: AbortSignal,
  fetchImpl?: Fetch,
): Promise<Page> {
  const params = new URLSearchParams();
  if (query.q !== undefined && query.q.trim() !== '') params.set('q', query.q.trim());
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const page = (await call(source, `/v1/docs?${params}`, {
    ...(signal === undefined ? {} : { signal }),
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  })) as Page;
  return {
    articles: page.articles.map((article) => resolve(source, article)),
    ...(page.next === undefined ? {} : { next: page.next }),
  };
}

/** Fetches a single article by id, e.g. for a link to one not in the loaded list. */
export async function getDoc(
  source: DocsSource,
  id: string,
  fetchImpl?: Fetch,
): Promise<DocArticle> {
  const article = (await call(source, `/v1/docs/${encodeURIComponent(id)}`, {
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  })) as DocArticle;
  return resolve(source, article);
}

export async function whoAmI(
  source: DocsSource,
  token: string,
): Promise<{ name: string; role: 'author' | 'reviewer' }> {
  return (await call(source, '/v1/me', { token })) as { name: string; role: 'author' | 'reviewer' };
}

export async function sendArticle(
  source: DocsSource,
  token: string,
  outgoing: Outgoing,
): Promise<{ id: string; seq: number }> {
  return (await call(source, '/v1/docs', { token, payload: outgoing })) as {
    id: string;
    seq: number;
  };
}

export async function myArticles(
  source: DocsSource,
  token: string,
): Promise<{ id: string; title: string; status: string; note: string }[]> {
  const body = (await call(source, '/v1/mine', { token })) as {
    articles: { id: string; title: string; status: string; note: string }[];
  };
  return body.articles;
}

/** An entry in an article's version history. */
export interface Version {
  seq: number;
  author: string;
  title: string;
  createdAt: string;
  /** `approved` for the live version, `superseded` for older ones. */
  status: string;
}

export async function historyOf(source: DocsSource, id: string): Promise<Version[]> {
  const body = (await call(source, `/v1/docs/${encodeURIComponent(id)}/history`)) as {
    versions: Version[];
  };
  return body.versions;
}

export async function versionOf(source: DocsSource, id: string, seq: number): Promise<DocArticle> {
  const article = (await call(
    source,
    `/v1/docs/${encodeURIComponent(id)}/versions/${seq}`,
  )) as DocArticle;
  return resolve(source, article);
}

/** Restores an earlier version as a new change by the caller, live immediately. */
export async function restoreVersion(
  source: DocsSource,
  token: string,
  id: string,
  seq: number,
): Promise<void> {
  await call(source, `/v1/docs/${encodeURIComponent(id)}/restore`, { token, payload: { seq } });
}
