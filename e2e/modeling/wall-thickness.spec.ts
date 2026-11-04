/** Wall thickness looks at the model and says what it finds. */

import { addBox, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

test('it names the thinnest wall, against a limit that can be changed', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Tools').click();
  await railButton(page, 'Wall thickness').click();
  const panel = page
    .getByRole('region', { name: 'Wall thickness' })
    .or(page.locator('.wall-panel'));
  await expect(page.locator('.wall-panel__verdict')).toContainText('Thinnest wall 15.00 mm');
  await expect(page.locator('.wall-panel__verdict')).toContainText('Everything is above');
  const limit = page.getByRole('textbox', { name: 'Thinnest allowed' });
  await expect(limit).toHaveAttribute('data-scrub', /.*/);
  await limit.fill('30');
  await expect(page.locator('.wall-panel__verdict')).toContainText('% of the part is under it');
  await expect(panel.first()).toBeVisible();
  // Closing gives the model its own colours back.
  await page.getByRole('button', { name: 'Exit Wall thickness' }).click();
  await expect(page.locator('.wall-panel')).toHaveCount(0);
});

test('the exploded view pulls two bodies apart and puts them back', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  for (const name of ['Sphere', 'Torus']) {
    await railButton(page, 'Parts').click();
    await railButton(page, name).click();
    await expect(page.locator('html[data-busy]')).toHaveCount(0);
    await railButton(page, 'Parts').click();
  }
  await page.getByRole('button', { name: 'Done' }).click();
  // The middle of the picture: the rails around it change as they are used.
  const clip = { x: 440, y: 200, width: 400, height: 300 };
  const before = await page.screenshot({ clip });
  await railButton(page, 'Exploded view').click();
  await expect(page.getByRole('slider', { name: 'Apart' })).toBeVisible();
  await expect.poll(async () => (await page.screenshot({ clip })).equals(before)).toBe(false);
  await expect(page.locator('canvas.viewport[data-exploded]')).toHaveCount(1);
  // The bodies themselves are on show, not only gone from where they were.
  await expect
    .poll(async () =>
      page.evaluate(
        async (data) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          context?.drawImage(image, 0, 0);
          const pixels = context?.getImageData(0, 0, image.width, image.height).data ?? [];
          let drawn = 0;
          for (let i = 0; i < pixels.length; i += 4) if ((pixels[i] ?? 255) < 170) drawn += 1;
          return drawn;
        },
        (await page.screenshot({ clip: { x: 60, y: 60, width: 860, height: 620 } })).toString(
          'base64',
        ),
      ),
    )
    .toBeGreaterThan(3000);
  await page.getByRole('button', { name: 'Exit Exploded view' }).click();
  await expect(page.locator('canvas.viewport[data-exploded]')).toHaveCount(0);
});

test('a panel beside the rail keeps the rail names off it', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Wall thickness').click();
  await expect(page.locator('.wall-panel')).toBeVisible();
  await railButton(page, 'Exploded view').hover();
  await expect(page.locator('.rail__label', { hasText: 'Exploded view' })).toBeHidden();

  await page.getByRole('button', { name: 'Exit Wall thickness' }).click();
  await railButton(page, 'Exploded view').hover();
  await expect(page.locator('.rail__label', { hasText: 'Exploded view' })).toBeVisible();
});
