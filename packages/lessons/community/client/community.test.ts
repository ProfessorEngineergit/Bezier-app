import { describe, expect, it } from 'vitest';
import { isCatalogEntry, isCatalogPage } from './catalog.js';
import { localIdFor, rememberDownload } from './downloads.js';
import { rememberUploadToken, uploadToken } from './publish.js';
import {
  addSource,
  loadSources,
  normalizeSourceUrl,
  removeSource,
  setSourceEnabled,
} from './sources.js';

const entry = {
  id: 'a'.repeat(32),
  title: 'Box',
  description: '',
  duration: 60,
  chapters: 3,
  size: 1000,
  sha256: 'b'.repeat(64),
  createdAt: '2026-10-01T00:00:00Z',
  author: 'Ada',
};

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('catalogue validation', () => {
  it('accepts a good entry and refuses ids that could escape a URL', () => {
    expect(isCatalogEntry(entry)).toBe(true);
    expect(isCatalogEntry({ ...entry, id: '../../etc/passwd' })).toBe(false);
    expect(isCatalogEntry({ ...entry, size: 10 ** 12 })).toBe(false);
    expect(isCatalogEntry({ ...entry, level: 'expert' })).toBe(false);
    expect(isCatalogPage({ lessons: [entry], next: '5' })).toBe(true);
    expect(isCatalogPage({ lessons: [{ ...entry, title: 'x'.repeat(500) }] })).toBe(false);
  });
});

describe('sources', () => {
  it('needs https, except for this machine', () => {
    expect(normalizeSourceUrl('https://lessons.example.org/')).toBe('https://lessons.example.org');
    expect(normalizeSourceUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(() => normalizeSourceUrl('http://lessons.example.org')).toThrow('https');
    expect(() => normalizeSourceUrl('https://user:pw@example.org')).toThrow('user name');
    expect(() => normalizeSourceUrl('not a url')).toThrow('web address');
  });

  it('starts empty, remembers, switches off and forgets', () => {
    const storage = memory();
    expect(loadSources(storage)).toEqual([]);
    addSource('https://a.example', '', storage);
    expect(() => addSource('https://a.example', '', storage)).toThrow('already');
    expect(loadSources(storage)[0]).toEqual({
      url: 'https://a.example',
      name: 'a.example',
      enabled: true,
    });
    expect(setSourceEnabled('https://a.example', false, storage)[0]?.enabled).toBe(false);
    expect(removeSource('https://a.example', storage)).toEqual([]);
  });

  it('survives storage that is broken', () => {
    expect(loadSources({ getItem: () => '{oops' })).toEqual([]);
  });
});

describe('what this device remembers per server', () => {
  const source = { url: 'https://a.example', name: 'A', enabled: true };

  it('keeps an upload token per server and forgets it when cleared', () => {
    const storage = memory();
    expect(uploadToken(source, storage)).toBe('');
    rememberUploadToken(source, 'secret', storage);
    expect(uploadToken(source, storage)).toBe('secret');
    expect(uploadToken({ ...source, url: 'https://b.example' }, storage)).toBe('');
    rememberUploadToken(source, '', storage);
    expect(uploadToken(source, storage)).toBe('');
  });

  it('maps a downloaded community lesson to its id in the library', () => {
    const storage = memory();
    expect(localIdFor(source, 'x', storage)).toBeUndefined();
    rememberDownload(source, 'x', 'local-1', storage);
    expect(localIdFor(source, 'x', storage)).toBe('local-1');
  });
});
