import { formatRef, RebuildCache } from '@bezier/core';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { PresentationSettings } from '@bezier/renderer';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { rectangleSketch } from '@bezier/ui';
import { expect, it } from 'vitest';
import { PresentationBodies } from '../../../../packages/renderer/src/presentation-bodies.js';
import { placeholderSolver } from '../placeholder-solver.js';
import { Session } from '../session.js';

const settings: PresentationSettings = {
  color: '#ffffff',
  roughness: 0.4,
  metalness: 0,
  transmission: 0,
  clearcoat: 0,
  exposure: 0,
  fov: 38,
  bloom: 0.15,
  dof: 0,
  focus: 1,
  background: '#222222',
  transparent: false,
  ground: true,
  groundColor: '#222222',
  environment: 1,
  light: 2,
  lightAngle: -45,
  turntable: false,
  duration: 12,
  textureScale: 1,
  grain: 1,
};

it('splits real B-Rep solids into independent finishes and keeps them across rebuilds', async () => {
  const kernel = await createOcctKernel();
  const session = await Session.create('appearance', 'Two parts', {
    kernel,
    solver: placeholderSolver(),
    store: new DocumentStore(new MemoryBackend()),
    cache: new RebuildCache(),
  });
  let view = await session.apply(
    [0, 100].flatMap((x, i) => [
      {
        op: 'addFeature' as const,
        id: `sketch-${i}`,
        type: 'sketch',
        name: 'Sketch',
        index: i * 2,
        params: {
          plane: 'XY',
          sketch: rectangleSketch(`r-${i}`, { x, y: 0, width: 40, height: 20 }),
        },
      },
      {
        op: 'addFeature' as const,
        id: `extrude-${i}`,
        type: 'extrude',
        name: 'Extrude',
        index: i * 2 + 1,
        params: { sketch: `sketch-${i}`, distance: 15 },
      },
    ]),
  );
  const manager = new PresentationBodies();
  try {
    expect(view.bodies).toHaveLength(2);
    await manager.setGeometry(view.display, view.bodies);
    const first = manager.entries.get('extrude-0'),
      second = manager.entries.get('extrude-1');
    if (!first || !second) throw new Error('Owning solids were lost');
    expect(first.mesh.geometry.boundingBox?.max.x).toBeCloseTo(40);
    expect(second.mesh.geometry.boundingBox?.min.x).toBeCloseTo(100);
    expect(first.mesh.geometry.getAttribute('position').count).toBeLessThan(
      (view.display?.mesh.positions.length ?? 0) / 3,
    );
    await manager.apply([
      {
        key: 'extrude-0',
        settings: { ...settings, color: '#ff4400', emission: 3, emissionMode: 'area' },
        surface: null,
      },
      { key: 'extrude-1', settings: { ...settings, transmission: 1, roughness: 0 }, surface: null },
    ]);
    expect(first.material.emissiveIntensity).toBe(3);
    expect(first.light.area.visible).toBe(true);
    expect(second.material.emissiveIntensity).toBe(0);
    expect(second.light.area.visible).toBe(false);
    expect(second.mesh.castShadow).toBe(false);
    expect(second.mesh.receiveShadow).toBe(false);
    expect(second.material.thickness).toBeCloseTo(15);
    view = await session.apply({
      op: 'updateParams',
      id: 'extrude-1',
      params: { sketch: 'sketch-1', distance: 25 },
    });
    await manager.setGeometry(view.display, view.bodies);
    expect(manager.entries.get('extrude-1')?.material.transmission).toBe(1);
    expect(manager.entries.get('extrude-0')?.material.emissiveIntensity).toBe(3);
    await manager.apply([{ key: 'extrude-0', settings, surface: null }]);
    expect(first.light.area.visible).toBe(false);
    expect(first.material.emissiveIntensity).toBe(0);
  } finally {
    manager.dispose();
  }
}, 30_000);

it('gives one face of a real solid a material of its own, which the body’s finish leaves alone', async () => {
  const kernel = await createOcctKernel();
  const session = await Session.create('faces', 'One part', {
    kernel,
    solver: placeholderSolver(),
    store: new DocumentStore(new MemoryBackend()),
    cache: new RebuildCache(),
  });
  let view = await session.apply([
    {
      op: 'addFeature',
      id: 'sketch-0',
      type: 'sketch',
      name: 'Sketch',
      index: 0,
      params: { plane: 'XY', sketch: rectangleSketch('r', { x: 0, y: 0, width: 40, height: 20 }) },
    },
    {
      op: 'addFeature',
      id: 'extrude-0',
      type: 'extrude',
      name: 'Extrude',
      index: 1,
      params: { sketch: 'sketch-0', distance: 15 },
    },
  ]);
  const manager = new PresentationBodies();
  try {
    await manager.setGeometry(view.display, view.bodies);
    const entry = manager.entries.get('extrude-0');
    if (!entry) throw new Error('the body is not shown');
    const top = view.bodies[0]?.faces.map(formatRef).find((name) => name.endsWith(':end'));
    if (top === undefined) throw new Error('the solid has no end face');
    await manager.applyFaces([
      { face: top, settings: { ...settings, color: '#8a5a2b' }, surface: null },
    ]);
    // Drawn in two materials now: the body's and the top's own, the top's triangles in a group.
    expect(Array.isArray(entry.mesh.material)).toBe(true);
    const groups = entry.mesh.geometry.groups;
    expect(groups.some((group) => group.materialIndex === 1)).toBe(true);
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(
      entry.mesh.geometry.getIndex()?.count,
    );
    const own = (entry.mesh.material as { color: { getHexString(): string } }[])[1];
    expect(own?.color.getHexString()).toBe('8a5a2b');
    // A new finish for the body is not the top's.
    await manager.apply([
      { key: 'extrude-0', settings: { ...settings, color: '#3366ff' }, surface: null },
    ]);
    expect(entry.material.color.getHexString()).toBe('3366ff');
    expect(own?.color.getHexString()).toBe('8a5a2b');
    // Kept across a rebuild, by the face's name.
    view = await session.apply({
      op: 'updateParams',
      id: 'extrude-0',
      params: { sketch: 'sketch-0', distance: 25 },
    });
    await manager.setGeometry(view.display, view.bodies);
    expect(Array.isArray(entry.mesh.material)).toBe(true);
    // Given back: one material again.
    await manager.applyFaces([]);
    expect(entry.mesh.material).toBe(entry.material);
    expect(entry.mesh.geometry.groups).toEqual([]);
  } finally {
    manager.dispose();
  }
}, 30_000);
