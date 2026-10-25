/**
 * Body visibility as a journalled, undoable edit (ADR 0012). Hiding and showing a body again must
 * give the identical canonical document, or the rebuild cache misses (ADR 0007).
 */

import { describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { parseProjectFile } from '../project-file.js';
import { apply, invert } from './journal.js';
import { describeOperation, type Operation } from './operations.js';

const fresh = () => createEmptyDocument('Bodies', () => new Date('2026-09-27T12:00:00.000Z'));

function run(document: CadDocument, operation: Operation): CadDocument {
  const result = apply(document, operation);
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

const hide = (key: string): Operation => ({ op: 'setBodyVisible', key, visible: false });
const show = (key: string): Operation => ({ op: 'setBodyVisible', key, visible: true });

describe('setBodyVisible', () => {
  it('keeps the hidden list sorted, and drops it when it empties', () => {
    const one = run(fresh(), hide('extrude-2'));
    const two = run(one, hide('extrude-1'));
    expect(two.meta.hiddenBodies).toEqual(['extrude-1', 'extrude-2']);
    const back = run(run(two, show('extrude-2')), show('extrude-1'));
    expect(back).toEqual(fresh());
    expect('hiddenBodies' in back.meta).toBe(false);
  });

  it('hiding twice is hiding once', () => {
    const twice = run(run(fresh(), hide('extrude-1')), hide('extrude-1'));
    expect(twice.meta.hiddenBodies).toEqual(['extrude-1']);
  });

  it('undoes to exactly the document before', () => {
    const before = run(fresh(), hide('extrude-1'));
    for (const operation of [hide('extrude-2'), show('extrude-1'), show('extrude-3')]) {
      const inverse = invert(before, operation);
      if (inverse === null) throw new Error('not invertible');
      expect(run(run(before, operation), inverse)).toEqual(before);
    }
  });

  it('says what it did', () => {
    expect(describeOperation(hide('extrude-1'))).toBe('Hide body');
    expect(describeOperation(show('extrude-1'))).toBe('Show body');
  });
});

describe('a project file with hidden bodies', () => {
  const file = (meta: Record<string, unknown>) =>
    JSON.stringify({ meta: { ...fresh().meta, ...meta }, features: [] });

  it('round-trips the hidden list', () => {
    const document = run(fresh(), hide('extrude-1'));
    expect(parseProjectFile(JSON.stringify(document))).toEqual(document);
  });

  it('reads a file that never hid anything exactly as before', () => {
    expect('hiddenBodies' in parseProjectFile(file({})).meta).toBe(false);
    expect('hiddenBodies' in parseProjectFile(file({ hiddenBodies: [] })).meta).toBe(false);
  });

  it('refuses a hidden list it cannot read', () => {
    expect(() => parseProjectFile(file({ hiddenBodies: 'extrude-1' }))).toThrow(/hidden bodies/);
    expect(() => parseProjectFile(file({ hiddenBodies: [3] }))).toThrow(/hidden bodies/);
  });
});

describe('renameBody', () => {
  const rename = (key: string, name: string): Operation => ({ op: 'renameBody', key, name });

  it('names a body, and an empty name takes it away again', () => {
    const named = run(fresh(), rename('extrude-1', '  Lid '));
    expect(named.meta.bodyNames).toEqual({ 'extrude-1': 'Lid' });
    const cleared = run(named, rename('extrude-1', ''));
    expect(cleared).toEqual(fresh());
  });

  it('undoes to exactly the document before', () => {
    const before = run(fresh(), rename('extrude-1', 'Base'));
    for (const operation of [rename('extrude-1', 'Case'), rename('extrude-2', 'Lid')]) {
      const inverse = invert(before, operation);
      if (inverse === null) throw new Error('not invertible');
      expect(run(run(before, operation), inverse)).toEqual(before);
    }
  });

  it('round-trips through a project file', () => {
    const document = run(fresh(), rename('extrude-1', 'Base'));
    expect(parseProjectFile(JSON.stringify(document))).toEqual(document);
  });
});
