/**
 * Article search by plain word matching. Every term must match; title matches rank above keyword
 * matches, which rank above body matches.
 */

import type { DocArticle } from './article.js';
import { plainText } from './markdown.js';

const fold = (text: string) => text.toLocaleLowerCase();

function score(article: DocArticle, term: string): number {
  if (fold(article.title).includes(term)) return 4;
  if (
    fold(article.keywords)
      .split(' ')
      .some((word) => word.startsWith(term))
  )
    return 3;
  if (fold(article.summary).includes(term)) return 2;
  return fold(plainText(article.body)).includes(term) ? 1 : 0;
}

/** Articles matching every term, best first; all articles in order when there are no terms. */
export function findArticles(
  terms: readonly string[],
  articles: readonly DocArticle[],
): readonly DocArticle[] {
  const words = terms.map(fold).filter((term) => term !== '');
  if (words.length === 0) return articles;
  return articles
    .map((article) => {
      const each = words.map((term) => score(article, term));
      return { article, total: each.includes(0) ? 0 : each.reduce((sum, value) => sum + value, 0) };
    })
    .filter((found) => found.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((found) => found.article);
}

/** Merges built-in and store articles; the store's version wins for the same id. */
export function mergeArticles(
  own: readonly DocArticle[],
  fromStore: readonly DocArticle[],
): readonly DocArticle[] {
  const replaced = new Set(fromStore.map((article) => article.id));
  return [...own.filter((article) => !replaced.has(article.id)), ...fromStore];
}

/** An article as plain text, for external consumers. */
export function articleText(article: DocArticle): string {
  return `${article.title}\n${article.summary}\n${plainText(article.body)}`;
}
