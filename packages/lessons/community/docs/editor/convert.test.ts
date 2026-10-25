/**
 * Round-trips every built-in article through the editor and back to Markdown. The built-in
 * articles serve as the corpus because they use every Markdown feature.
 */

import { describe, expect, it } from 'vitest';
import { ARTICLES } from '../../../../../apps/studio/src/help/articles/index.js';
import { parse } from '../format/markdown.js';
import { fromMarkdown, toMarkdown } from './convert.js';

describe('the editor and the Markdown', () => {
  it('give back every article of the app as it was', () => {
    expect(ARTICLES.length).toBeGreaterThan(50);
    for (const article of ARTICLES) {
      const again = toMarkdown(fromMarkdown(article.body));
      expect(parse(again), article.id).toEqual(parse(article.body));
      // A second round trip is stable.
      expect(toMarkdown(fromMarkdown(again)), article.id).toBe(again);
    }
  });

  it('keep marks that meet and nest, keys and links', () => {
    const text =
      'Press **Display**, then *Wireframe*. Or `w` and {{key:extrude}}, see [the **view**](doc:display-modes).';
    expect(toMarkdown(fromMarkdown(text))).toBe(text);
  });

  it('make an empty article one empty paragraph, and write it as nothing', () => {
    const doc = fromMarkdown('');
    expect(doc.childCount).toBe(1);
    expect(toMarkdown(doc)).toBe('');
  });
});
