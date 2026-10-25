import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import { apply, invert } from './journal.js';
import type { Operation } from './operations.js';

const AT = '2026-10-09T12:00:00.000Z';
const BIG = 'x'.repeat(10_000);

function withImage() {
  const added = apply(
    createEmptyDocument('Doc', () => new Date(AT)),
    {
      op: 'addFeature',
      id: 'image-1',
      type: 'reference-image',
      name: 'Photo',
      index: 0,
      params: { image: BIG, x: 0, width: 100 },
    },
  );
  if (!added.ok) throw new Error(added.reason);
  return added.document;
}

describe('patchParams', () => {
  it('changes the keys it names and leaves the rest, the picture included', () => {
    const patched = apply(withImage(), {
      op: 'patchParams',
      id: 'image-1',
      params: { x: 12, width: 80 },
    });
    expect(patched.ok && patched.document.features[0]?.params).toEqual({
      image: BIG,
      x: 12,
      width: 80,
    });
  });

  it('is undone by a patch of only what it touched, so a nudge costs a nudge in the journal', () => {
    const document = withImage();
    const op: Operation = { op: 'patchParams', id: 'image-1', params: { x: 12 } };
    const inverse = invert(document, op);
    expect(inverse).toEqual({ op: 'patchParams', id: 'image-1', params: { x: 0 } });
    expect(JSON.stringify(inverse).length).toBeLessThan(200);
    const patched = apply(document, op);
    if (!patched.ok || inverse === null) throw new Error('did not apply');
    const undone = apply(patched.document, inverse);
    expect(undone.ok && undone.document.features).toEqual(document.features);
  });

  it('takes a parameter away with null, and the inverse of adding one is exactly that', () => {
    const document = withImage();
    const op: Operation = { op: 'patchParams', id: 'image-1', params: { opacity: 0.5 } };
    const inverse = invert(document, op);
    expect(inverse).toEqual({ op: 'patchParams', id: 'image-1', params: { opacity: null } });
    const patched = apply(document, op);
    if (!patched.ok || inverse === null) throw new Error('did not apply');
    const undone = apply(patched.document, inverse);
    expect(undone.ok && undone.document.features).toEqual(document.features);
  });

  it('refuses a feature that is not there, without throwing', () => {
    expect(apply(withImage(), { op: 'patchParams', id: 'nope', params: { x: 1 } }).ok).toBe(false);
  });
});
