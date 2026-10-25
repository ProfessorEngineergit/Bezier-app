/**
 * Shell against the real OCCT kernel. Shell depends on live face resolution, so a fake kernel
 * would only test the fixture.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CadDocument, RebuildResult } from '../document.js';
import { createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';
import { stubSolver, testSketch } from '../rebuild/testing.js';
import { parseRef } from '../stable-ref.js';
import { shellFeature } from './shell.js';
import type { FeatureRecord } from './types.js';

const LOAD_TIMEOUT_MS = 120_000;

const extrude: FeatureRecord = {
  id: 'extrude-1',
  type: 'extrude',
  name: 'Extrude',
  params: { sketch: 'sketch-1', distance: 15, direction: 'forward', operation: 'new' },
};

function boxDocument(): CadDocument {
  const base = createEmptyDocument('Shell test', () => new Date('2026-08-08T12:00:00.000Z'));
  return { ...base, features: [testSketch, extrude] };
}

describe('shell feature', () => {
  let kernel: GeometryKernel;
  let box: RebuildResult;

  beforeAll(async () => {
    kernel = await createOcctKernel();
    box = await rebuild(boxDocument(), { kernel, solver: stubSolver() });
  }, LOAD_TIMEOUT_MS);

  it('shells a box through a valid face reference', async () => {
    const faceName = [...box.naming.knownNames()].sort()[0];
    expect(faceName).toBeDefined();
    expect(box.body).not.toBeNull();
    if (faceName === undefined || box.body === null) return;

    const result = await shellFeature.rebuild(
      kernel,
      { faces: [parseRef(faceName)], thickness: 2 },
      {
        body: box.body,
        resolve: (ref) => box.naming.resolve(kernel, ref),
        profiles: () => null,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.body).not.toBeNull();
  });

  it('rejects a shell with no selected faces', async () => {
    expect(box.body).not.toBeNull();
    if (box.body === null) return;

    const result = await shellFeature.rebuild(
      kernel,
      { faces: [], thickness: 2 },
      {
        body: box.body,
        resolve: (ref) => box.naming.resolve(kernel, ref),
        profiles: () => null,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid-result', message: 'Select at least one face to remove.' },
    });
  });
});
