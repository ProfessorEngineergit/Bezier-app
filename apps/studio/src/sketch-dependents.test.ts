import { type CadDocument, faceRef } from '@bezier/core';
import { describe, expect, it } from 'vitest';
import { dependentsOf, facesBuiltOn } from './sketch-dependents.js';

const doc = (features: { id: string; params: Record<string, unknown> }[]) =>
  ({ features: features.map((f) => ({ ...f, type: 'x', name: f.id })) }) as unknown as CadDocument;

describe('what is built on a sketch', () => {
  const document = doc([
    { id: 'sketch-1', params: {} },
    { id: 'sketch-12', params: {} },
    { id: 'extrude-1', params: { sketch: 'sketch-1', regions: ['sketch-1#0'] } },
    { id: 'extrude-2', params: { sketch: 'sketch-12' } },
    { id: 'fillet-1', params: { edges: ['E(F:extrude-1:top|F:extrude-1:side-1)'] } },
    { id: 'fillet-2', params: { edges: ['E(F:extrude-2:top|F:extrude-2:side-1)'] } },
  ]);

  it('follows the history down, and does not mistake sketch-12 for sketch-1', () => {
    expect([...dependentsOf(document, 'sketch-1')]).toEqual(['sketch-1', 'extrude-1', 'fillet-1']);
  });

  it('gives the faces on show those features made', () => {
    const faces = [
      faceRef('extrude-1', 'top'),
      faceRef('fillet-1', 'round-0'),
      faceRef('extrude-2', 'top'),
      null,
    ];
    expect(
      facesBuiltOn(document, 'sketch-1', faces).map((f) => f.kind === 'face' && f.feature),
    ).toEqual(['extrude-1', 'fillet-1']);
  });
});
