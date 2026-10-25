import { describe, expect, it } from 'vitest';
import { CHANNEL_FEATURES } from './channel-features.js';
import { ARTICLES, articlesFor } from './help/index.js';
import { settingsMatching, settingsOf } from './settings-catalog.js';

const ids = (channel: 'stable' | 'beta' | 'alpha') => settingsOf(channel).map((s) => s.id);

describe('stable, beta and alpha', () => {
  it('leaves the pages about a server out of Settings below alpha, and keeps them on alpha', () => {
    for (const channel of ['stable', 'beta'] as const) {
      expect(ids(channel)).not.toContain('collaboration');
      expect(ids(channel)).not.toContain('community');
      expect(ids(channel)).toContain('updates');
    }
    expect(ids('alpha')).toContain('collaboration');
    expect(ids('alpha')).toContain('community');
  });

  it('does not find an alpha page by searching below alpha', () => {
    expect(settingsMatching(['community'], 'stable')).toEqual([]);
    expect(settingsMatching(['community'], 'beta')).toEqual([]);
    expect(settingsMatching(['community'], 'alpha').map((s) => s.id)).toEqual(['community']);
    expect(settingsMatching(['channel'], 'stable').map((s) => s.id)).toEqual(['updates']);
    expect(settingsMatching(['invitation'], 'stable').map((s) => s.id)).toEqual(['updates']);
  });

  it('shows no article about an alpha thing below alpha, and no link that leads to one', () => {
    const hidden = new Set(ARTICLES.filter((article) => article.gate === 'alpha').map((a) => a.id));
    expect(hidden.size).toBeGreaterThan(0);
    for (const channel of ['stable', 'beta'] as const) {
      const shown = articlesFor(channel);
      expect(shown.some((article) => hidden.has(article.id))).toBe(false);
      for (const article of shown)
        for (const [, id] of article.body.matchAll(/\]\(doc:([a-z0-9-]+)\)/g))
          expect(hidden.has(id ?? ''), `${article.id} links to ${id}`).toBe(false);
    }
    expect(articlesFor('alpha')).toBe(ARTICLES);
  });

  it('names what is held back once, and every name is unique', () => {
    const named = CHANNEL_FEATURES.map((feature) => feature.id);
    expect(new Set(named).size).toBe(named.length);
    expect(named).toEqual(
      expect.arrayContaining(['community', 'plugins', 'collaboration', 'self-hosting']),
    );
  });
});
