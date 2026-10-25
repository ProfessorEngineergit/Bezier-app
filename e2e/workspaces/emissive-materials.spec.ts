/** Compare exported render pixels: glow alone must not substitute for lighting the stage. */
import { readFile } from 'node:fs/promises';
import { addBox, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

test('LEDs illuminate the stage, headlights have a beam and ordinary materials clear emission', async ({
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
  await page.getByLabel('Search materials').fill('Blue LED');
  await page.getByRole('button', { name: 'Blue LED', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Light Strength', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '3',
  );
  await page.getByLabel('Light emission', { exact: true }).selectOption('surface');
  const capture = async (name: string) => {
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    const file = test.info().outputPath(`${name}.png`);
    await (await saved).saveAs(file);
    return (await readFile(file)).toString('base64');
  };
  const surface = await capture('surface-only');
  await page.getByLabel('Light emission', { exact: true }).selectOption('area');
  const area = await capture('blue-area');
  const difference = await page.evaluate(
    async ({ surface, area }) => {
      const pixels = async (encoded: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${encoded}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No pixel reader');
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      const [a, b] = await Promise.all([pixels(surface), pixels(area)]);
      let changed = 0;
      // The bottom quarter is floor, away from the emissive body and its bloom halo.
      for (let y = Math.floor(a.height * 0.75); y < a.height; y++) {
        for (let x = 0; x < a.width * 0.7; x++) {
          const i = (y * a.width + x) * 4;
          if ((b.data[i + 2] ?? 0) - (a.data[i + 2] ?? 0) > 5) changed++;
        }
      }
      return changed;
    },
    { surface, area },
  );
  expect(difference, 'area light changes actual floor pixels').toBeGreaterThan(500);
  await page.getByLabel('Search materials').fill('Headlight');
  await page.getByRole('button', { name: 'Headlight', exact: true }).click();
  await expect(page.getByLabel('Light emission', { exact: true })).toHaveValue('spot');
  await page.getByRole('slider', { name: 'Beam Angle', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', { name: 'Beam Angle', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '36',
  );
  await page.getByLabel('Light direction', { exact: true }).selectOption('right');
  await capture('headlight-right');
  await page.getByLabel('Search materials').fill('LED Strip');
  await page.getByRole('button', { name: 'LED Strip', exact: true }).click();
  const strength = page.getByRole('slider', { name: 'Light Strength', exact: true });
  await strength.focus();
  await page.keyboard.press('Home');
  await expect(strength).toHaveAttribute('aria-valuenow', '0');
  await capture('strip-off');
  await page.getByLabel('Search materials').fill('Polished Aluminium');
  await page.getByRole('button', { name: 'Polished Aluminium', exact: true }).click();
  await expect(page.getByLabel('Light emission', { exact: true })).toHaveCount(0);
  await capture('ordinary-material');
  await expect(page.locator('.viz__error')).toHaveCount(0);
});
