import { describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument, type SavedView } from '../document.js';
import { parseProjectFile } from '../project-file.js';
import { diffOperations } from './diff.js';
import { apply as applyOperation, invert } from './journal.js';

const view = (x: number): SavedView => ({
  name: '',
  position: [x, -100, 80],
  target: [0, 0, 0],
  parallel: false,
  zoom: 1,
});

function apply(document: CadDocument, name: string, saved: SavedView | null): CadDocument {
  const result = applyOperation(document, { op: 'setSavedView', name, view: saved });
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

describe('saved views (audit F-034)', () => {
  const empty = createEmptyDocument('Views');
  it('keeps views in the order saved, replaces one by name and removes it', () => {
    const two = apply(apply(empty, 'Hinge', view(1)), 'Clip', view(2));
    expect(two.meta.savedViews?.map((v) => v.name)).toEqual(['Hinge', 'Clip']);
    const replaced = apply(two, 'Hinge', view(9));
    expect(replaced.meta.savedViews?.[0]?.position[0]).toBe(9);
    const gone = apply(apply(replaced, 'Hinge', null), 'Clip', null);
    expect('savedViews' in gone.meta).toBe(false);
    // Undone, a removed view comes back with its camera.
    const undo = invert(replaced, { op: 'setSavedView', name: 'Clip', view: null });
    expect(undo).toEqual({ op: 'setSavedView', name: 'Clip', view: { ...view(2), name: 'Clip' } });
  });

  it('travels in the project file and in a diff', () => {
    const saved = apply(empty, 'Hinge', view(1));
    const file = JSON.parse(JSON.stringify(saved));
    expect(parseProjectFile(JSON.stringify(file)).meta.savedViews).toEqual(saved.meta.savedViews);
    const ops = diffOperations(empty, saved);
    let replayed: CadDocument = empty;
    for (const op of ops) {
      const r = applyOperation(replayed, op);
      if (!r.ok) throw new Error(r.reason);
      replayed = r.document;
    }
    expect(replayed.meta.savedViews).toEqual(saved.meta.savedViews);
  });
});
