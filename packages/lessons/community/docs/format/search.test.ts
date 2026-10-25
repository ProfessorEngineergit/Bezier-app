import { describe, expect, it } from 'vitest';
import type { DocArticle } from './article.js';
import { findArticles, mergeArticles } from './search.js';

const make = (id: string, title: string, over: Partial<DocArticle> = {}): DocArticle => ({
  id,
  title,
  area: 'View',
  summary: 'Something to do.',
  keywords: '',
  body: '1. Do it.',
  images: {},
  ...over,
});

const ARTICLES = [
  make('display-modes', 'Wireframe, X-Ray and Shaded', { keywords: 'wireframe edges' }),
  make('export', 'Export', { body: '1. Choose STL for printing.' }),
  make('extrude', 'Extrude', { summary: 'Pull a sketch into a solid.' }),
];

describe('searching the docs', () => {
  it('finds a word, and the start of a word', () => {
    expect(findArticles(['wireframe'], ARTICLES)[0]?.id).toBe('display-modes');
    expect(findArticles(['wiref'], ARTICLES)[0]?.id).toBe('display-modes');
  });

  it('wants every word, finds words in the text, and puts a title match first', () => {
    expect(findArticles(['printing'], ARTICLES).map((a) => a.id)).toEqual(['export']);
    expect(findArticles(['wireframe', 'zzz'], ARTICLES)).toEqual([]);
    expect(findArticles(['solid', 'extrude'], ARTICLES)[0]?.id).toBe('extrude');
  });

  it('lets a store’s article replace the app’s at the same address', () => {
    const merged = mergeArticles(ARTICLES, [make('export', 'Export, better', { author: 'Ada' })]);
    expect(merged.find((a) => a.id === 'export')?.title).toBe('Export, better');
    expect(merged).toHaveLength(3);
  });
});
