import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../fixtures.js';

const path = (file: string) => `/@fs${fileURLToPath(new URL(file, import.meta.url))}`;
const step = readFileSync(
  fileURLToPath(new URL('../fixtures-files/box-30x20x12.step', import.meta.url)),
  'utf8',
);

test('a datum intersection stays on the solid and Space-style camera arrival has no final shrink', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(
    async ({ kernelPath, rendererPath, experimentPath, file }) => {
      const { createKernel }: typeof import('../../packages/kernel/src/index.js') = await import(
        kernelPath
      );
      const { createViewport }: typeof import('../../packages/renderer/src/index.js') =
        await import(rendererPath);
      const { projectionArrival }: typeof import('../../tools/spikes/projection-arrival.js') =
        await import(experimentPath);
      const kernel = await createKernel();
      const imported = await kernel.importStep(file);
      if (!imported.ok) throw new Error(imported.error.message);
      const moved = await kernel.translate(imported.value, { x: -15, y: -10, z: -6 });
      if (!moved.ok) throw new Error(moved.error.message);
      const mesh = await kernel.tessellate(moved.value.shape);
      if (!mesh.ok) throw new Error(mesh.error.message);
      const canvas = document.createElement('canvas');
      canvas.style.cssText =
        'position:fixed;inset:90px auto auto 90px;width:640px;height:480px;z-index:1000';
      document.body.append(canvas);
      const viewport = createViewport({ canvas, pixelRatio: 1 });
      viewport.resize(640, 480);
      viewport.setAppearance('#202022', '#323235', '#454548');
      viewport.setAxesVisible(false);
      viewport.setGeometry({ mesh: mesh.value, edges: null, faceRefs: [] });
      viewport.setView('default');
      const pixels = async () => {
        const image = await viewport.capture();
        if (image === null) throw new Error('No rendered frame');
        const bitmap = await createImageBitmap(image);
        const reader = document.createElement('canvas');
        reader.width = bitmap.width;
        reader.height = bitmap.height;
        const context = reader.getContext('2d');
        if (context === null) throw new Error('No pixel reader');
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return context.getImageData(0, 0, reader.width, reader.height).data;
      };
      const deltas: number[] = [];
      for (const plane of ['XY', 'YZ', 'XZ'] as const) {
        viewport.setGridPlane(plane);
        viewport.setGridVisible(true);
        const marked = await pixels();
        viewport.setGridVisible(false);
        const plain = await pixels();
        const probe = plane === 'XZ' ? { x: 15, y: 0, z: 0 } : { x: 0, y: -10, z: 0 };
        const point = viewport.project(probe.x, probe.y, probe.z);
        if (point === null) throw new Error('Datum point out of view');
        let delta = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const index = (Math.round(point.y + dy) * 640 + Math.round(point.x + dx)) * 4;
            // Any channel: the line takes its axis colour, which darkens one channel and brightens
            // another.
            for (let channel = 0; channel < 3; channel++)
              delta = Math.max(
                delta,
                Math.abs((plain[index + channel] ?? 0) - (marked[index + channel] ?? 0)),
              );
          }
        deltas.push(delta);
      }
      viewport.setGridPlane('XY');
      viewport.setGridVisible(true);
      const previews: Record<string, string> = {};
      for (const side of ['above', 'below'] as const) {
        // From below in perspective: in a parallel corner view the grid faces the line of sight
        // instead (helpers.ts), so there is no floor to meet.
        if (side === 'below') {
          viewport.setViewBetween(['bottom', 'front', 'right']);
          viewport.setOrthographic(false);
        }
        const shot = await viewport.capture();
        if (shot !== null) previews[side] = URL.createObjectURL(shot);
        const marked = await pixels();
        viewport.setGridVisible(false);
        const plain = await pixels();
        const point = viewport.project(15, 0, 0);
        if (point === null) throw new Error('Intersection is not visible');
        let delta = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const index = (Math.round(point.y + dy) * 640 + Math.round(point.x + dx)) * 4;
            // Any channel: the line takes its axis colour, which darkens one channel and brightens
            // another.
            for (let channel = 0; channel < 3; channel++)
              delta = Math.max(
                delta,
                Math.abs((plain[index + channel] ?? 0) - (marked[index + channel] ?? 0)),
              );
          }
        deltas.push(delta);
        viewport.setGridVisible(true);
      }
      const untouched: number[] = [];
      for (const offset of [12, -12, 6]) {
        const shifted = await kernel.translate(moved.value.shape, { x: 0, y: 0, z: offset });
        if (!shifted.ok) throw new Error(shifted.error.message);
        const shiftedMesh = await kernel.tessellate(shifted.value.shape);
        if (!shiftedMesh.ok) throw new Error(shiftedMesh.error.message);
        viewport.setGeometry({ mesh: shiftedMesh.value, edges: null, faceRefs: [] });
        viewport.setView(offset === 6 ? 'bottom' : 'default');
        // The key light follows the camera in the render loop; compare settled frames.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        viewport.setGridVisible(true);
        const marked = await pixels();
        viewport.setGridVisible(false);
        const plain = await pixels();
        const point = viewport.project(0, offset === 6 ? 0 : -10, offset === 6 ? 0 : offset);
        if (point === null) throw new Error('Body not visible');
        const index = (Math.round(point.y) * 640 + Math.round(point.x)) * 4;
        untouched.push(Math.abs((plain[index] ?? 0) - (marked[index] ?? 0)));
        await kernel.dispose(shifted.value.shape);
      }
      viewport.setGeometry({ mesh: mesh.value, edges: null, faceRefs: [] });
      viewport.setView('default');
      viewport.setGridVisible(true);
      viewport.setView('front', true);
      const widths: number[] = [];
      const arrivalWidths: number[] = [];
      await new Promise<void>((resolve) => {
        const started = performance.now();
        const tick = () => {
          const a = viewport.project(-15, -10, 0);
          const b = viewport.project(15, -10, 0);
          const width = Math.abs((b?.x ?? 0) - (a?.x ?? 0));
          widths.push(width);
          const elapsed = performance.now() - started;
          if (elapsed >= 300) arrivalWidths.push(width);
          if (elapsed > 620) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const parallel = viewport.isOrthographic();
      // Leave a view for the screenshot, then release every renderer and kernel object.
      const frame = await viewport.capture();
      const url = frame === null ? '' : URL.createObjectURL(frame);
      const image = document.createElement('img');
      image.src = url;
      image.style.cssText = canvas.style.cssText;
      document.body.append(image);
      viewport.dispose();
      canvas.remove();
      await kernel.dispose(imported.value);
      await kernel.dispose(moved.value.shape);
      return {
        deltas,
        untouched,
        widths,
        arrivalWidths,
        parallel,
        previews,
        experiment: projectionArrival(),
      };
    },
    {
      kernelPath: path('../../packages/kernel/src/index.ts'),
      rendererPath: path('../../packages/renderer/src/index.ts'),
      experimentPath: path('../../tools/spikes/projection-arrival.ts'),
      file: step,
    },
  );
  for (const delta of result.deltas) expect(delta).toBeGreaterThan(4);
  // Above, below and resting exactly on the floor: none may get a line or raster over its face.
  for (const delta of result.untouched) expect(delta).toBeLessThanOrEqual(1);
  expect(result.parallel).toBe(true);
  const settled = result.widths.at(-1) ?? 0;
  expect(settled).toBeGreaterThan(200);
  // The end of the flight must settle gradually, with no projection-switch-sized step. Measured in
  // time, not frames: on slow GPUs eight frames cover most of the flight.
  expect(result.arrivalWidths.length).toBeGreaterThan(1);
  expect(Math.max(...result.arrivalWidths) - Math.min(...result.arrivalWidths)).toBeLessThan(1);
  expect(result.experiment.jump).toBeLessThan(1e-9);
  await page.screenshot({ path: test.info().outputPath('datum-and-square-view.png') });
  for (const side of ['above', 'below']) {
    await page.evaluate((source) => {
      const image = document.querySelector('body > img');
      if (image instanceof HTMLImageElement) image.src = source;
    }, result.previews[side] ?? '');
    await page.screenshot({ path: test.info().outputPath(`datum-from-${side}.png`) });
  }
});
