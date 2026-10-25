/** Render subdivisions must resolve to exact circular topology, even in a face-on view. */
import { faceRef, formatRef } from '@bezier/core';
import { createKernel, type KernelResult } from '@bezier/kernel';
import { OrthographicCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { faceNormalAt } from './frames.js';
import { buildGeometry, indexFaceVertices } from './mesh.js';
import { Picker } from './picking.js';

function value<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

it('picks the entire circular rim from Top, independently of mesh samples', async () => {
  const kernel = await createKernel({ inProcess: true });
  const body = value(
    await kernel.extrude(
      {
        loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 10 }]],
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xDirection: { x: 1, y: 0, z: 0 },
      },
      10,
    ),
  );
  const faces = value(await kernel.describeFaces(body));
  expect(faces).toHaveLength(3);
  const refs = faces.map((_, i) => faceRef('cylinder', `face-${i}`));
  const picker = new Picker();
  const camera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 1000);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  try {
    for (const deflection of [0.1, 0.02]) {
      const rendered = value(
        await kernel.tessellate(body, { linearDeflection: deflection, angularDeflection: 0.1 }),
      );
      picker.setGeometry(rendered, refs);
      const geometry = buildGeometry(rendered, [0.5, 0.5, 0.5]);
      const frames = { faces: indexFaceVertices(rendered), geometry };
      const curvedIndex = faces.findIndex((f) => f.surfaceType === 'cylinder');
      for (const angle of [0.2, 1, 2, 4]) {
        const normal = faceNormalAt(frames, curvedIndex, {
          x: 10 * Math.cos(angle),
          y: 10 * Math.sin(angle),
          z: 10,
        });
        expect(
          (normal?.x ?? 0) * Math.cos(angle) + (normal?.y ?? 0) * Math.sin(angle),
        ).toBeGreaterThan(0.99);
        expect(normal?.z).toBeCloseTo(0);
      }
      geometry.dispose();
      let name: string | null = null;
      for (const angle of [0.2, 0.5, 1, 2, 3, 4, 5]) {
        const p = new Vector3(10 * Math.cos(angle), 10 * Math.sin(angle), 10).project(camera);
        const hit = picker.pick(camera, p.x, p.y, 0.015, 'edge');
        expect(hit?.ref.kind).toBe('edge');
        if (!hit || hit.ref.kind !== 'edge') throw new Error('Circular rim was not picked');
        const picked = formatRef(hit.ref);
        name ??= picked;
        expect(picked).toBe(name);
        const a = hit.ref.faces[0],
          b = hit.ref.faces[1];
        const fa = faces[refs.findIndex((r) => formatRef(r) === formatRef(a))];
        const fb = faces[refs.findIndex((r) => formatRef(r) === formatRef(b))];
        if (!fa || !fb) throw new Error('No adjacent faces');
        const edge = value(await kernel.sharedEdge(fa.id, fb.id));
        expect(edge).not.toBeNull();
        if (edge === null) throw new Error('Rim is not real topology');
        const rounded = value(await kernel.fillet(body, [edge], 1));
        await kernel.dispose(rounded.shape);
      }
    }
    const centre = picker.pick(camera, 0, 0, 0.015);
    expect(centre?.ref.kind).toBe('face');
    // The opposite rim is fully hidden by the cap and must never be chosen instead.
    const below = camera.clone();
    below.position.z = -50;
    below.lookAt(0, 0, 0);
    below.updateMatrixWorld(true);
    const p = new Vector3(10, 0, 0).project(below);
    const bottom = picker.pick(below, p.x, p.y, 0.015, 'edge');
    expect(bottom?.ref.kind).toBe('edge');
    expect(bottom?.point.z).toBeCloseTo(0);
  } finally {
    await kernel.dispose(body);
  }
}, 30_000);
