import { describe, expect, it } from 'vitest';
import {
  addFolder,
  type DashboardIndex,
  emptyIndex,
  folderOf,
  forgetDocument,
  parseIndex,
  placeDocument,
  removeFolder,
  renameFolder,
  serializeIndex,
} from './organization.js';

describe('folders', () => {
  it('adds and renames without touching placements', () => {
    let index = addFolder(emptyIndex, 'f1', 'Plotter');
    index = renameFolder(index, 'f1', 'Plotter parts');
    expect(index.folders).toEqual([{ id: 'f1', name: 'Plotter parts' }]);
  });

  it('refuses to add the same folder id twice', () => {
    const once = addFolder(emptyIndex, 'f1', 'A');
    expect(addFolder(once, 'f1', 'B')).toBe(once);
  });

  it('returns a folder’s documents to the top level when it is deleted', () => {
    let index = addFolder(emptyIndex, 'f1', 'Plotter');
    index = placeDocument(index, 'doc-a', 'f1');
    index = placeDocument(index, 'doc-b', 'f1');

    const after = removeFolder(index, 'f1');
    expect(after.folders).toEqual([]);
    // The work is not filed anywhere, but it is not gone either.
    expect(folderOf(after, 'doc-a')).toBeNull();
    expect(folderOf(after, 'doc-b')).toBeNull();
  });
});

describe('placements', () => {
  it('files a document and moves it back to the top level', () => {
    let index = addFolder(emptyIndex, 'f1', 'Plotter');
    index = placeDocument(index, 'doc-a', 'f1');
    expect(folderOf(index, 'doc-a')).toBe('f1');

    index = placeDocument(index, 'doc-a', null);
    expect(folderOf(index, 'doc-a')).toBeNull();
  });

  it('ignores a placement into a folder that does not exist', () => {
    const index = placeDocument(emptyIndex, 'doc-a', 'ghost');
    expect(folderOf(index, 'doc-a')).toBeNull();
  });

  it('forgets a document entirely when it is deleted', () => {
    let index = addFolder(emptyIndex, 'f1', 'Plotter');
    index = placeDocument(index, 'doc-a', 'f1');
    index = forgetDocument(index, 'doc-a');
    expect(folderOf(index, 'doc-a')).toBeNull();
    expect(index.folders).toHaveLength(1);
  });
});

describe('parsing', () => {
  it('reads back exactly what it wrote', () => {
    let index = addFolder(emptyIndex, 'f1', 'Plotter');
    index = placeDocument(index, 'doc-a', 'f1');
    expect(parseIndex(serializeIndex(index))).toEqual(index);
  });

  it('treats a missing or unreadable index as nothing filed yet', () => {
    expect(parseIndex(null)).toEqual(emptyIndex);
    expect(parseIndex('{ not json')).toEqual(emptyIndex);
  });

  it('drops malformed folders and placements rather than refusing the whole index', () => {
    const wire = JSON.stringify({
      folders: [{ id: 'f1', name: 'Good' }, { id: 42 }, { name: 'no id' }],
      placements: { 'doc-a': 'f1', 'doc-b': 99 },
    });
    const index: DashboardIndex = parseIndex(wire);
    expect(index.folders).toEqual([{ id: 'f1', name: 'Good' }]);
    expect(index.placements).toEqual({ 'doc-a': 'f1' });
  });
});
