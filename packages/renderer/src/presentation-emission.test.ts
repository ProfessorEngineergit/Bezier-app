import { Box3, Scene, Vector3 } from 'three/webgpu';
import { expect, it } from 'vitest';
import { PresentationEmission } from './presentation-emission.js';

it('places the light outside the body and aims along a fixed world direction', () => {
  const scene = new Scene();
  const lights = new PresentationEmission(scene);
  const box = new Box3(new Vector3(-20, -5, 0), new Vector3(20, 5, 10));
  lights.setBounds(box);
  lights.update({
    color: '#ff3428',
    emission: 4,
    emissionMode: 'area',
    emissionDirection: 'front',
  });
  expect(lights.area.visible).toBe(true);
  expect(lights.spot.visible).toBe(false);
  expect(lights.area.position.y).toBeLessThan(box.min.y);
  expect(lights.area.width).toBe(40);
  expect(lights.area.height).toBe(10);
  // RectAreaLight emits down its local -Z, unlike Object3D's usual +Z forward.
  const forward = new Vector3(0, 0, -1).applyQuaternion(lights.area.quaternion);
  expect(forward.y).toBeCloseTo(-1);
  expect(lights.area.color.getHexString()).toBe('ff3428');
  lights.update({
    color: '#ffffff',
    emission: 8,
    emissionMode: 'spot',
    emissionDirection: 'right',
    emissionBeam: 40,
  });
  expect(lights.area.visible).toBe(false);
  expect(lights.spot.position.x).toBeGreaterThan(box.max.x);
  expect(lights.spot.target.position.x).toBeGreaterThan(lights.spot.position.x);
  expect(lights.spot.angle).toBeCloseTo(Math.PI / 9);
  expect(lights.spot.intensity).toBeGreaterThan(0);
  lights.update({ color: '#ffffff' });
  expect(lights.area.visible).toBe(false);
  expect(lights.spot.visible).toBe(false);
  expect(lights.spot.intensity).toBe(0);
  lights.dispose();
  expect(scene.children).toHaveLength(0);
});

it('scales lighting with CAD units and clears it when there is no model', () => {
  const lights = new PresentationEmission(new Scene());
  const settings = { color: '#ffffff', emission: 3, emissionMode: 'spot' as const };
  lights.setBounds(new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 30)));
  lights.update(settings);
  const before = lights.spot.intensity;
  lights.setBounds(new Box3(new Vector3(0, 0, 0), new Vector3(20, 40, 60)));
  expect(lights.spot.intensity).toBeCloseTo(before * 4);
  lights.setBounds(null);
  expect(lights.spot.visible).toBe(false);
  expect(lights.spot.intensity).toBe(0);
  lights.dispose();
});
