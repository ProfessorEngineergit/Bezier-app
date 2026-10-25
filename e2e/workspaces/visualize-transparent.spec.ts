/** Visualize: what a capture holds, and what only the screen shows. */
import { readFile } from 'node:fs/promises';
import { addBox, openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

test('the transparent backdrop stays clear in a capture with glow (audit F-057)', async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 600_000 : 240_000);
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  await expect(page.getByLabel('PBR presentation viewport')).toHaveAttribute('aria-busy', 'false', {
    timeout: 120_000,
  });
  await page.getByRole('tab', { name: 'Environment' }).click();
  await page.locator('[data-environment="transparent"]').click();
  // Glow is on by default (15 %); the capture must not get a black veil over it.
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  const file = test.info().outputPath('transparent.png');
  await (await saved).saveAs(file);
  const encoded = (await readFile(file)).toString('base64');
  const corner = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No pixel reader');
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(2, 2, 1, 1).data[3];
  }, encoded);
  expect(corner).toBe(0);
});

test('a picked body is outlined in the selection colour, and the capture leaves it out (audit F-058)', async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 600_000 : 240_000);
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  const viewport = page.getByLabel('PBR presentation viewport');
  await expect(viewport).toHaveAttribute('aria-busy', 'false', { timeout: 120_000 });
  /** Pixels clearly in the selection's cyan, not the grey box or backdrop. */
  const cyan = (png: Buffer) =>
    page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No pixel reader');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const [r = 0, g = 0, b = 0] = [pixels[i], pixels[i + 1], pixels[i + 2]];
        if (b - r > 60 && g - r > 30) count++;
      }
      return count;
    }, png.toString('base64'));
  // The model only: the look panel on the right has its own colour picker.
  const area = await viewport.boundingBox();
  if (area === null) throw new Error('no viewport');
  const model = () =>
    page.screenshot({
      clip: { x: area.x, y: area.y + 60, width: area.width * 0.65, height: area.height - 120 },
    });
  expect(await cyan(await model())).toBe(0);
  await openItems(page);
  await page.locator('.items-panel').getByText('Body 1').click();
  await expect.poll(async () => cyan(await model())).toBeGreaterThan(200);

  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  const file = test.info().outputPath('picked.png');
  await (await saved).saveAs(file);
  expect(await cyan(await readFile(file))).toBe(0);
});
