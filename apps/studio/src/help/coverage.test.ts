import { listFeatures } from '@bezier/core';
import { pictureMismatch, problemWith } from '@bezier/lessons';
import { KEY_ACTIONS } from '@bezier/ui';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../settings-catalog.js';
import { ARTICLES } from './articles/index.js';
import { NOT_YET } from './not-yet.js';

const covered = (pick: (article: (typeof ARTICLES)[number]) => readonly string[] | undefined) =>
  new Set(ARTICLES.flatMap((article) => pick(article) ?? []));

describe('the docs cover what the app offers', () => {
  // Each NOT_YET list must equal the gap exactly, so both a new undocumented item and a stale
  // NOT_YET entry fail.
  it('every keyboard action has an article, except the ones listed as not yet written', () => {
    const has = covered((article) => article.actions);
    const missing = KEY_ACTIONS.map((action) => action.id).filter((id) => !has.has(id));
    expect(missing.sort()).toEqual([...NOT_YET.actions].sort());
  });

  it('every kind of feature has an article, except the ones listed', () => {
    const has = covered((article) => article.features);
    const missing = listFeatures()
      .map((feature) => feature.type)
      .filter((type) => !has.has(type));
    expect(missing.sort()).toEqual([...NOT_YET.features].sort());
  });

  it('every Settings page has an article, except the ones listed', () => {
    const has = covered((article) => article.settings);
    const missing = CATEGORIES.map((item) => item.id).filter((id) => !has.has(id));
    expect(missing.sort()).toEqual([...NOT_YET.settings].sort());
  });

  it('names only things that exist, links only to articles that do, and is written well', () => {
    const actions = new Set(KEY_ACTIONS.map((action) => action.id));
    const features = new Set(listFeatures().map((feature) => feature.type));
    const settings = new Set(CATEGORIES.map((item) => item.id));
    const ids = new Set(ARTICLES.map((article) => article.id));
    expect(ids.size).toBe(ARTICLES.length);
    for (const article of ARTICLES) {
      for (const action of article.actions ?? []) expect(actions, article.id).toContain(action);
      for (const feature of article.features ?? []) expect(features, article.id).toContain(feature);
      for (const tab of article.settings ?? []) expect(settings, article.id).toContain(tab);
      for (const [, id] of article.body.matchAll(/\]\(doc:([a-z0-9-]+)\)/g))
        expect(ids, `${article.id} links to ${id}`).toContain(id);
      for (const [, action] of article.body.matchAll(/\{\{key:([a-z0-9-]+)\}\}/g))
        expect(actions, `${article.id} shows the key of ${action}`).toContain(action);
      // Same validation as for user-submitted articles.
      expect(problemWith(article), article.id).toBeNull();
      const { missing, unused } = pictureMismatch(article);
      expect(missing, `${article.id} shows a picture it does not have`).toEqual([]);
      expect(unused, `${article.id} has a picture it does not show`).toEqual([]);
    }
  });
});
