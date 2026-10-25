import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import { parseProjectFile } from '../project-file.js';
import { apply, invert } from './journal.js';
import type { Operation } from './operations.js';

const base = createEmptyDocument('Folders', () => new Date('2026-09-27T12:00:00.000Z'));

function run(...ops: Operation[]) {
  return ops.reduce((doc, op) => {
    const result = apply(doc, op);
    if (!result.ok) throw new Error(result.reason);
    return result.document;
  }, base);
}

describe('body folders', () => {
  it('files bodies and takes them out again, back to no key at all', () => {
    const filed = run(
      { op: 'setBodyFolder', key: 'extrude-2', folder: 'Lid' },
      { op: 'setBodyFolder', key: 'extrude-1', folder: ' Case ' },
    );
    expect(filed.meta.bodyFolders).toEqual({ 'extrude-1': 'Case', 'extrude-2': 'Lid' });
    const out = run(
      { op: 'setBodyFolder', key: 'extrude-1', folder: 'Case' },
      { op: 'setBodyFolder', key: 'extrude-1', folder: '' },
    );
    expect('bodyFolders' in out.meta).toBe(false);
  });

  it('undoes to the identical document, and survives a save', () => {
    const start = run({ op: 'setBodyFolder', key: 'a', folder: 'One' });
    for (const op of [
      { op: 'setBodyFolder', key: 'a', folder: 'Two' },
      { op: 'setBodyFolder', key: 'b', folder: 'One' },
      { op: 'setBodyFolder', key: 'a', folder: '' },
    ] satisfies Operation[]) {
      const inverse = invert(start, op);
      if (inverse === null) throw new Error('not undoable');
      const done = apply(start, op);
      if (!done.ok) throw new Error(done.reason);
      const back = apply(done.document, inverse);
      expect(back.ok && back.document).toEqual(start);
    }
    expect(parseProjectFile(JSON.stringify(start)).meta.bodyFolders).toEqual({ a: 'One' });
  });
});
