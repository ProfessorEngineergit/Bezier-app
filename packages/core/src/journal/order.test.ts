import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import { testSketch } from '../rebuild/testing.js';
import { moveProblem, namedSteps } from './order.js';
import '../features/index.js';

const document = {
  ...createEmptyDocument('Order'),
  features: [
    testSketch,
    {
      id: 'extrude-1',
      type: 'extrude',
      name: 'Extrude',
      params: { sketch: 'sketch-1', distance: 15, direction: 'forward', operation: 'new' },
    },
    { ...testSketch, id: 'sketch-2', name: 'Sketch 2' },
  ],
};

describe('history order (audit F-053)', () => {
  it('reads what a step stands on from its parameters', () => {
    expect([...namedSteps(document, 'extrude-1')]).toEqual(['sketch-1']);
    expect(namedSteps(document, 'sketch-2').size).toBe(0);
  });

  it('lets an independent step move and refuses one above what it is built on', () => {
    expect(moveProblem(document, 'sketch-2', 0)).toBeNull();
    expect(moveProblem(document, 'extrude-1', 0)).toMatch(
      /Extrude is built on .*so it has to stay below it/,
    );
    expect(moveProblem(document, 'sketch-1', 2)).toMatch(/Extrude is built on/);
  });
});
