import { describe, expect, it } from 'vitest';
import { LARGE_FACES, largeModelQuestion } from './large-model.js';

describe('asking before a large model is taken into a heavy workspace', () => {
  it('asks for Drawings and Visualize on a model of the Voron size', () => {
    for (const workspace of ['drawings', 'visualize']) {
      expect(largeModelQuestion(workspace, 108_000)?.message).toContain('108,000 faces');
    }
  });

  it('does not ask for Simulation, which meshes only when asked to solve', () => {
    expect(largeModelQuestion('simulation', 108_000)).toBeNull();
  });

  it('gives a time for Drawings, which was measured', () => {
    expect(largeModelQuestion('drawings', 108_000)?.message).toMatch(/about \d+ seconds/);
  });

  it('never asks for a part, nor for Modeling', () => {
    expect(largeModelQuestion('drawings', LARGE_FACES - 1)).toBeNull();
    expect(largeModelQuestion('modeling', 500_000)).toBeNull();
  });
});
