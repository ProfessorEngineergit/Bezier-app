import { describe, expect, it } from 'vitest';
import { matchesAll, parseSearch } from './library-search.js';

describe('the start page search', () => {
  it('searches everywhere by default', () => {
    expect(parseSearch('  Bracket  v2 ')).toEqual({
      scope: 'all',
      terms: ['bracket', 'v2'],
      operator: null,
    });
  });

  it('narrows to settings with an operator, with or without a space after it', () => {
    expect(parseSearch('settings: Theme').scope).toBe('settings');
    expect(parseSearch('settings:theme').terms).toEqual(['theme']);
    expect(parseSearch('Settings:').terms).toEqual([]);
    expect(parseSearch('einstellungen: maus').scope).toBe('settings');
  });

  it('narrows to projects', () => {
    expect(parseSearch('projects: bracket')).toEqual({
      scope: 'projects',
      terms: ['bracket'],
      operator: 'projects',
    });
  });

  it('leaves an unknown word with a colon as ordinary text', () => {
    expect(parseSearch('M8: bolt')).toEqual({
      scope: 'all',
      terms: ['m8:', 'bolt'],
      operator: null,
    });
  });

  it('needs every word to match', () => {
    expect(matchesAll('Appearance theme dark light', ['dark', 'theme'])).toBe(true);
    expect(matchesAll('Appearance theme dark light', ['dark', 'mouse'])).toBe(false);
  });
});
