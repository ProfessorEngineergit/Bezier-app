/** Revolve against the real OCCT kernel. */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CadDocument } from '../document.js';
import { createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';
import { stubSolver, testSketch } from '../rebuild/testing.js';
import type { FeatureRecord } from './types.js';

const LOAD_TIMEOUT_MS = 120_000;

function revolve(angleDegrees: number): FeatureRecord {
  return {
    id: 'revolve-1',
    type: 'revolve',
    name: 'Revolve',
    params: { sketch: 'sketch-1', axis: 'u', angleDegrees, operation: 'new' },
  };
}

function documentWith(feature: FeatureRecord): CadDocument {
  const base = createEmptyDocument('Revolve test', () => new Date('2026-08-08T12:00:00.000Z'));
  return { ...base, features: [testSketch, feature] };
}

describe('revolve feature', () => {
  let kernel: GeometryKernel;

  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  it('revolves a rectangle fully around its sketch u axis', async () => {
    const result = await rebuild(documentWith(revolve(360)), {
      kernel,
      solver: stubSolver(),
    });

    expect(result.statuses.get('sketch-1')).toEqual({ state: 'ok' });
    expect(result.statuses.get('revolve-1')).toEqual({ state: 'ok' });
    expect(result.body).not.toBeNull();
  });

  it('rejects a zero-degree revolve before calling the permissive kernel', async () => {
    const result = await rebuild(documentWith(revolve(0)), {
      kernel,
      solver: stubSolver(),
    });

    expect(result.statuses.get('revolve-1')).toEqual({
      state: 'failed',
      message: 'Revolve angle must be between 0.01 and 360 degrees.',
    });
    expect(result.body).toBeNull();
  });
});

describe('revolve with a rise per turn', () => {
  it(
    'winds the profile into a solid that climbs the axis (audit F-018)',
    async () => {
      const kernel = await createOcctKernel();
      const result = await rebuild(
        documentWith({
          id: 'revolve-1',
          type: 'revolve',
          name: 'Thread',
          params: {
            sketch: 'sketch-1',
            axis: 'v',
            angleDegrees: 360,
            operation: 'new',
            pitch: 30,
            turns: 2,
          },
        }),
        { kernel, solver: stubSolver() },
      );
      expect(result.statuses.get('revolve-1')).toEqual({ state: 'ok' });
      expect(result.body).not.toBeNull();
    },
    LOAD_TIMEOUT_MS,
  );
});
