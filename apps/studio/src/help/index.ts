import { type Channel, reaches } from '@bezier/lessons';
import { ARTICLES } from './articles/index.js';
import type { BuiltIn } from './define.js';

export { ARTICLES };

const forChannel = new Map<Channel, readonly BuiltIn[]>();

/**
 * Returns the articles visible on a channel. Articles gated above the channel are removed, and
 * links to them are replaced by their plain text.
 */
export function articlesFor(channel: Channel): readonly BuiltIn[] {
  if (reaches(channel, 'alpha')) return ARTICLES;
  const cached = forChannel.get(channel);
  if (cached !== undefined) return cached;
  const hidden = new Set(
    ARTICLES.filter((article) => article.gate !== undefined && !reaches(channel, article.gate)).map(
      (a) => a.id,
    ),
  );
  const shown = ARTICLES.filter((article) => !hidden.has(article.id)).map((article) => ({
    ...article,
    body: article.body.replace(
      /\[([^\]]+)\]\(doc:([a-z0-9-]+)\)/g,
      (link, words: string, id: string) => (hidden.has(id) ? words : link),
    ),
  }));
  forChannel.set(channel, shown);
  return shown;
}
