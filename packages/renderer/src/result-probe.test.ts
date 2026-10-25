/** Probe the same displayed surface and scalar interpolation as the result shader. */

import type { Mesh } from '@bezier/kernel';
import { OrthographicCamera } from 'three';
import { expect, it } from 'vitest';
import { ResultProbe } from './result-probe.js';

const mesh: Mesh = {
  positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  triangleFaces: new Uint32Array([0]),
};
const field = {
  values: new Float32Array([0, 10, 20]),
  displacement: null,
  min: 0,
  max: 20,
  palette: 'rainbow' as const,
  bands: 0,
};
const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
it('interpolates scalar readings rather than sampling one vertex or the rendered RGB', () => {
  const probe = new ResultProbe(mesh, field);
  expect(probe.sample(camera, 0, 0, 0)).toBeCloseTo(12.5);
  expect(probe.sample(camera, 0.9, 0.9, 0)).toBeNull();
  probe.update({ ...field, cutBelow: 15 });
  expect(probe.sample(camera, 0, 0, 0)).toBeNull();
  probe.dispose();
});
it('hits the actual deformed surface', () => {
  const probe = new ResultProbe(mesh, {
    ...field,
    displacement: new Float32Array([2, 0, 0, 2, 0, 0, 2, 0, 0]),
  });
  expect(probe.sample(camera, 0, 0, 0)).toBeCloseTo(12.5);
  expect(probe.sample(camera, 0, 0, 1)).toBeNull();
  expect(probe.sample(camera, 1, 0, 1)).toBeCloseTo(12.5);
  probe.dispose();
});
