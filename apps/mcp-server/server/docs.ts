/**
 * The app's help articles for an assistant: search, read, and pictures.
 *
 * Read from `apps/mcp-server/docs/agent-docs.json`, which a test keeps equal to the Docs page
 * (apps/studio/src/help/agent-docs.ts). Pictures come from the studio's public folder when run from
 * a checkout and are skipped when missing. Each picture lists where its arrows point, as
 * fractions of its size, for assistants working from screenshots.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Content } from './protocol.ts';

interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Article {
  id: string;
  title: string;
  area: string;
  summary: string;
  keywords: string;
  body: string;
  images: Record<string, { file: string; alt: string; arrows: Arrow[] }>;
  actions: string[];
  features: string[];
  settings: string[];
  places: string[];
}

export interface KeyAction {
  id: string;
  label: string;
  group: string;
  keys: Record<string, string>;
}

export interface AgentDocs {
  articles: Article[];
  keymap: { presets: { id: string; label: string }[]; actions: KeyAction[] };
  settings: { id: string; label: string; group: string }[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..', 'docs');
const PUBLIC = join(HERE, '..', '..', 'studio', 'public');

export function loadDocs(): AgentDocs {
  return JSON.parse(readFileSync(join(DOCS, 'agent-docs.json'), 'utf8')) as AgentDocs;
}

export function computerUseGuide(): string {
  return readFileSync(join(DOCS, 'computer-use.md'), 'utf8');
}

/** Articles by how well they match: title, then keywords, then summary and text. */
export function searchDocs(docs: AgentDocs, query: string, limit = 8): Article[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1);
  if (words.length === 0) return docs.articles.slice(0, limit);
  const scored = docs.articles.map((article) => {
    const title = article.title.toLowerCase();
    const keywords = article.keywords.toLowerCase();
    const rest = `${article.summary} ${article.body}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      // An id match ranks first, so "fillet" finds Fillet before articles that mention fillets.
      if (article.id.split('-').includes(word)) score += 8;
      if (title.includes(word)) score += 6;
      if (keywords.split(' ').includes(word)) score += 4;
      else if (keywords.includes(word)) score += 2;
      if (rest.includes(word)) score += 1;
    }
    return { article, score };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.article);
}

/** `{{key:extrude}}` as the key in `preset`, or as "no key" when that preset has none. */
export function withKeys(text: string, docs: AgentDocs, preset: string): string {
  const actions = new Map(docs.keymap.actions.map((action) => [action.id, action]));
  return text.replace(/\{\{key:([a-z0-9-]+)\}\}/g, (_, id: string) => {
    const action = actions.get(id);
    const key = action?.keys[preset] ?? action?.keys.native;
    return key === undefined ? `(${action?.label ?? id}: no key)` : `\`${key}\``;
  });
}

/** One article as text, and its pictures as images when asked for and on disk. */
export function readArticle(
  docs: AgentDocs,
  article: Article,
  preset: string,
  pictures: boolean,
): Content[] {
  const content: Content[] = [];
  const lines = [
    `# ${article.title}`,
    `Area: ${article.area}. ${article.summary}`,
    '',
    withKeys(article.body, docs, preset).replace(
      /!\[\]\(image:([a-z0-9-]+)\)/g,
      (_, name: string) => `[picture "${name}": ${article.images[name]?.alt ?? 'missing'}]`,
    ),
  ];
  const related = article.body.match(/\(doc:[a-z0-9-]+\)/g) ?? [];
  if (related.length > 0) {
    lines.push('', `Linked articles: ${related.map((link) => link.slice(5, -1)).join(', ')}`);
  }
  content.push({ type: 'text', text: lines.join('\n') });
  for (const [name, image] of Object.entries(article.images)) {
    const arrows = image.arrows
      .map((arrow, i) => `arrow ${i + 1} points at ${pct(arrow.x2)} across, ${pct(arrow.y2)} down`)
      .join('; ');
    content.push({
      type: 'text',
      text: `Picture "${name}": ${image.alt}.${arrows === '' ? '' : ` ${arrows}.`}`,
    });
    if (!pictures) continue;
    // Pictures may not be generated yet (pnpm help:pictures).
    const file = join(PUBLIC, image.file.replace(/^\//, ''));
    if (existsSync(file)) {
      content.push({
        type: 'image',
        data: readFileSync(file).toString('base64'),
        mimeType: 'image/webp',
      });
    }
  }
  return content;
}

const pct = (value: number) => `${Math.round(value * 100)} %`;
