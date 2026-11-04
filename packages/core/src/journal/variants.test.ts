/** Named sets of variable values, kept with the document and undone like any edit. */
import { describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import '../features/index.js';
import { parseProjectFile } from '../project-file.js';
import { apply, invert } from './journal.js';
import type { Operation } from './operations.js';

function run(document: CadDocument, op: Operation): CadDocument {
  const result = apply(document, op);
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

const empty = () => createEmptyDocument('Box', () => new Date(0));
const small = { op: 'setVariant', name: 'Small', values: { wall: '2 mm' } } as const;

describe('variants', () => {
  it('saves one, and replaces it in place under the same name', () => {
    const large = run(run(empty(), small), {
      op: 'setVariant',
      name: 'Large',
      values: { wall: '6' },
    });
    const changed = run(large, { op: 'setVariant', name: 'Small', values: { wall: '1' } });
    expect(changed.meta.variants?.map((variant) => variant.name)).toEqual(['Small', 'Large']);
    expect(changed.meta.variants?.[0]?.values).toEqual({ wall: '1' });
  });

  it('removes one, leaving no empty list behind', () => {
    const gone = run(run(empty(), small), { op: 'setVariant', name: 'Small', values: null });
    expect(gone.meta.variants).toBeUndefined();
  });

  it('undoes a save, and a removal', () => {
    const saved = run(empty(), small);
    const undo = invert(empty(), small);
    expect(undo).toEqual({ op: 'setVariant', name: 'Small', values: null });
    const removal: Operation = { op: 'setVariant', name: 'Small', values: null };
    expect(invert(saved, removal)).toEqual(small);
  });

  it('refuses a variant without a name', () => {
    expect(apply(empty(), { op: 'setVariant', name: ' ', values: {} }).ok).toBe(false);
  });

  it('survives a project file, and a broken one says so', () => {
    const saved = run(empty(), small);
    expect(parseProjectFile(JSON.stringify(saved)).meta.variants).toEqual(saved.meta.variants);
    const broken = { ...saved, meta: { ...saved.meta, variants: [{ name: 'x' }] } };
    expect(() => parseProjectFile(JSON.stringify(broken))).toThrow('variants');
  });
});

describe('a step in a project file', () => {
  const view = { position: [1, 2, 3], target: [0, 0, 0], parallel: false, zoom: 1 };
  const withStep = (camera: unknown) =>
    JSON.stringify({
      ...empty(),
      features: [
        {
          id: 'a',
          type: 'sketch',
          name: 'Sketch',
          params: { plane: 'XY', sketch: { primitives: [], constraints: [] } },
          view: camera,
        },
      ],
    });

  it('keeps the camera it was made from', () => {
    expect(parseProjectFile(withStep(view)).features[0]?.view).toEqual(view);
  });

  it('opens without one it cannot read', () => {
    expect(parseProjectFile(withStep({ position: 1 })).features[0]?.view).toBeUndefined();
  });
});
