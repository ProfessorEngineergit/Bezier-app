/**
 * The pictures of the parts library: each part as Bezier builds it, with its real thread, rendered
 * in bead-blasted aluminium under soft studio light, on nothing. The geometry is
 * the feature's own, at the size the card stands for.
 *
 *   TOUR=1 pnpm exec playwright test e2e/tour/parts-pictures.spec.ts --project=tour
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fastenerFeature } from '../../packages/core/src/features/fastener.js';
import { createOcctKernel } from '../../packages/kernel/src/occt-kernel.js';
import { test } from '../fixtures.js';

/** How each lies: tipped towards the eye, then turned in the picture. */
const PARTS = [
  { kind: 'socket-head', size: 'M8', length: 30, lie: [-1.12, -0.62] },
  { kind: 'hex-bolt', size: 'M8', length: 30, lie: [-1.12, -0.62] },
  { kind: 'countersunk', size: 'M8', length: 30, lie: [-1.12, -0.62] },
  { kind: 'hex-nut', size: 'M12', length: 0, lie: [-0.86, 0.26] },
  { kind: 'washer', size: 'M12', length: 0, lie: [-0.98, 0.26] },
] as const;

for (const part of PARTS) {
  test(part.kind, async ({ page }) => {
    test.setTimeout(180_000);
    const kernel = await createOcctKernel();
    const built = await fastenerFeature.rebuild(
      kernel,
      { ...part, plane: 'XY', placement: '', thread: part.kind !== 'washer' } as never,
      { body: null } as never,
    );
    if (!built.ok) throw new Error(built.error.message);
    const mesh = await kernel.tessellate(
      built.value.body as never,
      {
        linearDeflection: 0.004,
        angularDeflection: 0.08,
      } as never,
    );
    if (!mesh.ok) throw new Error(mesh.error.message);
    await page.goto('/favicon.png');
    const png = await page.evaluate(
      async ({ positions, normals, indices, lie }) => {
        const THREE = await import(/* @vite-ignore */ '/@id/three');
        const width = 2400;
        const height = 1800;
        const canvas = document.createElement('canvas');
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        });
        renderer.setSize(width, height, false);
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        const scene = new THREE.Scene();
        // A photographer's studio: a dim room with large soft lights above, beside and low in
        // front. On metal the lights are the picture: long bright bands along the thread, and
        // something for the faces turned to the eye to reflect.
        const studio = new THREE.Scene();
        studio.background = new THREE.Color(0x63666b);
        const softbox = (width: number, height: number, power: number, at: number[]) => {
          const light = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(power, power, power),
              side: THREE.DoubleSide,
            }),
          );
          light.position.set(at[0] ?? 0, at[1] ?? 0, at[2] ?? 0);
          light.lookAt(0, 0, 0);
          studio.add(light);
        };
        softbox(12, 8, 3.2, [0, 8, 2]);
        softbox(4, 12, 2.6, [-9, 1, 3]);
        softbox(3, 10, 1.8, [9, 0, 2]);
        softbox(14, 5, 1.15, [0, -3, 9]);
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(studio, 0.02).texture;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingBox();
        const centre = new THREE.Vector3();
        geometry.boundingBox.getCenter(centre);
        geometry.translate(-centre.x, -centre.y, -centre.z);
        // Bead-blasted aluminium: pale and satin, soft highlights, no mirror.
        const metal = new THREE.MeshPhysicalMaterial({
          color: 0xe6e8eb,
          metalness: 1,
          roughness: 0.42,
        });
        const body = new THREE.Mesh(geometry, metal);
        const tipped = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lie[0]);
        const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), lie[1]);
        body.quaternion.copy(turned.multiply(tipped));
        body.updateMatrixWorld();
        scene.add(body);
        const box = new THREE.Box3().setFromObject(body, true);
        const span = box.getSize(new THREE.Vector3());
        const middle = box.getCenter(new THREE.Vector3());
        body.position.sub(middle);
        const fov = 18;
        const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 5000);
        const fill = 0.8;
        const half = Math.max(span.x / (width / height), span.y) / 2 / fill;
        camera.position.set(0, 0, half / Math.tan((fov * Math.PI) / 360) + span.z / 2);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        return canvas.toDataURL('image/png').split(',')[1] ?? '';
      },
      {
        positions: Array.from(mesh.value.positions),
        normals: Array.from(mesh.value.normals),
        indices: Array.from(mesh.value.indices),
        lie: part.lie,
      },
    );
    const path = `/tmp/part-${part.kind}.png`;
    writeFileSync(path, Buffer.from(png, 'base64'));
    execFileSync('cwebp', [
      '-quiet',
      '-q',
      '90',
      '-alpha_q',
      '95',
      '-resize',
      '1200',
      '900',
      path,
      '-o',
      `apps/studio/public/parts/${part.kind}.webp`,
    ]);
  });
}
