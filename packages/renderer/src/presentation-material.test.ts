import { BufferAttribute, BufferGeometry, MeshPhysicalMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { addBoxProjectedUVs, PresentationMaterialLibrary } from './presentation-material.js';

describe('presentation material UV projection', () => {
  it('projects each face from its dominant normal without stretching thin sides', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([0, 0, 0, 20, 0, 0, 20, 10, 0, 0, 0, 0, 0, 10, 0, 0, 10, 5]),
        3,
      ),
    );
    geometry.setAttribute(
      'normal',
      new BufferAttribute(
        new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0]),
        3,
      ),
    );

    addBoxProjectedUVs(geometry);

    expect(Array.from(geometry.getAttribute('uv').array)).toEqual([
      0, 0, 1, 0, 1, 0.5, 0, 0, 0.5, 0, 0.5, 0.25,
    ]);
  });

  it('builds distinct microstructure and scales its grain strength', async () => {
    const library = new PresentationMaterialLibrary();
    const material = new MeshPhysicalMaterial();
    await library.set(material, {
      kind: 'procedural',
      pattern: 'abs',
      repeat: 7,
      normalStrength: 0.5,
    });
    const abs = material.normalMap?.image as { data?: Uint8Array } | undefined;
    expect(abs?.data?.length).toBe(256 * 256 * 4);
    const absSample = Array.from(abs?.data?.slice(0, 64) ?? []);

    await library.set(material, {
      kind: 'procedural',
      pattern: 'pla',
      repeat: 2,
      normalStrength: 0.8,
    });
    const pla = material.normalMap?.image as { data?: Uint8Array } | undefined;
    expect(Array.from(pla?.data?.slice(0, 64) ?? [])).not.toEqual(absSample);

    library.setGrain(material, 1.5);
    expect(material.normalScale.x).toBeCloseTo(1.2);
    expect(material.normalScale.y).toBeCloseTo(1.2);
    library.dispose();
    material.dispose();
  });

  it('evicts old texture sets without disposing the active finish and applies scale and rotation', async () => {
    const library = new PresentationMaterialLibrary();
    const material = new MeshPhysicalMaterial();
    const surface = {
      kind: 'procedural' as const,
      pattern: 'abs' as const,
      repeat: 3,
      normalStrength: 0.5,
    };
    await library.set(material, surface);
    const first = material.normalMap;
    let released = false;
    first?.addEventListener('dispose', () => {
      released = true;
    });
    library.setScale(1.5);
    library.setRotation(Math.PI / 2);
    expect(material.normalMap?.repeat.x).toBe(2);
    expect(material.normalMap?.rotation).toBe(Math.PI / 2);
    for (let i = 4; i <= 9; i++) await library.set(material, { ...surface, repeat: i });
    expect(released).toBe(true);
    expect(material.normalMap).not.toBe(first);
    await library.set(material, surface);
    expect(material.normalMap).not.toBe(first);
    await library.set(material, null);
    expect(material.normalMap).toBeNull();
    expect(material.roughnessMap).toBeNull();
    expect(material.metalnessMap).toBeNull();
    expect(material.aoMap).toBeNull();
    library.dispose();
    material.dispose();
  });
});
