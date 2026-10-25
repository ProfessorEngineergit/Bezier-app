import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

const kernelPath = `/@fs${fileURLToPath(new URL('../../packages/kernel/src/index.ts', import.meta.url))}`;
const fixture = readFileSync(
  fileURLToPath(new URL('../fixtures-files/box-30x20x12.step', import.meta.url)),
  'utf8',
);

test('a rotated STEP dropped below the floor is grounded, saved and exported in its print position', async ({
  page,
}) => {
  await openApp(page);
  const rotated = await page.evaluate(
    async ({ modulePath, file }) => {
      const { createKernel }: typeof import('../../packages/kernel/src/index.js') = await import(
        modulePath
      );
      const kernel = await createKernel();
      const original = await kernel.importStep(file);
      if (!original.ok) throw new Error(original.error.message);
      const tilted = await kernel.rotate(
        original.value,
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        -Math.PI / 4,
      );
      if (!tilted.ok) throw new Error(tilted.error.message);
      const moved = await kernel.translate(tilted.value.shape, { x: 0, y: 0, z: -20 });
      if (!moved.ok) throw new Error(moved.error.message);
      const exported = await kernel.exportStep(moved.value.shape);
      if (!exported.ok) throw new Error(exported.error.message);
      await kernel.dispose(original.value);
      await kernel.dispose(tilted.value.shape);
      await kernel.dispose(moved.value.shape);
      return exported.value;
    },
    { modulePath: kernelPath, file: fixture },
  );
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({
    name: 'tilted.step',
    mimeType: 'application/step',
    buffer: Buffer.from(rotated),
  });
  await expect
    .poll(() => page.locator('canvas.viewport').getAttribute('data-triangles'))
    .toBe('12');
  await page.reload();
  await page.getByRole('button', { name: 'Open Untitled', exact: true }).click();
  await expect(page.locator('canvas.viewport')).toHaveAttribute('data-triangles', '12');
  await page.locator('.titlebar__export').click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /^STEP/ }).click();
  const file = readFileSync(await (await download).path(), 'utf8');
  const bounds = await page.evaluate(
    async ({ modulePath, text }) => {
      const { createKernel }: typeof import('../../packages/kernel/src/index.js') = await import(
        modulePath
      );
      const kernel = await createKernel();
      const imported = await kernel.importStep(text);
      if (!imported.ok) throw new Error(imported.error.message);
      const box = await kernel.bounds(imported.value);
      await kernel.dispose(imported.value);
      if (!box.ok) throw new Error(box.error.message);
      return box.value;
    },
    { modulePath: kernelPath, text: file },
  );
  expect(bounds.min.z).toBeCloseTo(0, 4);
  expect(bounds.max.z).toBeCloseTo((20 + 12) / Math.sqrt(2), 4);
  await page.screenshot({ path: test.info().outputPath('grounded-rotated-import.png') });
});
