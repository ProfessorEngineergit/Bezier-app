/** Real local material maps and a rendered capture, with external requests blocked. */
import { addBox, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

test('the three source libraries render offline and grain direction stays adjustable', async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 600_000 : 240_000);
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') await route.continue();
    else {
      external.push(url.hostname);
      await route.abort();
    }
  });
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  await expect(page.getByLabel('PBR presentation viewport')).toHaveAttribute('aria-busy', 'false', {
    timeout: 120_000,
  });
  for (const [name, folder, extension, source] of [
    ['Brushed Aluminium', 'gpu_brushed_aluminium', 'png', 'GPUOpen · MIT'],
    ['Fine Pebble Plastic', 'plastic013a', 'jpg', 'ambientCG · CC0'],
    ['American Walnut', 'american_walnut_veneer', 'jpg', 'Poly Haven · CC0'],
  ] as const) {
    await page.getByLabel('Search materials').fill(name ?? '');
    const responses = Promise.all(
      ['albedo', 'normal', 'roughness'].map((map) =>
        page.waitForResponse((r) => r.url().endsWith(`/materials/${folder}/${map}.${extension}`)),
      ),
    );
    await page.getByRole('button', { name, exact: true }).click();
    for (const response of await responses) expect(response.ok()).toBe(true);
    await expect(page.getByText('Loading maps…', { exact: true })).toHaveCount(0);
    await expect(page.locator('.viz-used')).toContainText(source ?? '');
    await expect(page.locator('.viz__error')).toHaveCount(0);
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    await (await saved).saveAs(test.info().outputPath(`${folder}.png`));
  }
  const direction = page.getByRole('slider', { name: 'Grain Direction', exact: true });
  await page.mouse.move(1, 1);
  await expect(direction.locator('.slider__lit')).toHaveCSS('opacity', '0.78');
  await direction.hover();
  await expect(direction.locator('.slider__lit')).toHaveCSS('opacity', '1');
  await expect(direction).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(direction.locator('.slider__edge')).toHaveCSS('transform', /1\.12/);
  await direction.focus();
  await page.keyboard.press('ArrowRight');
  await expect(direction).toHaveAttribute('aria-valuenow', '1');
  expect(external).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('material-library.png') });
});
