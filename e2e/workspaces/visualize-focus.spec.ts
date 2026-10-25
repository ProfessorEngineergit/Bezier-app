/**
 * In Visualize a right click sets the focus point; a right drag turns the view and must not. Tied
 * to the context menu event, every turn would set focus where it ended (Windows, Linux) or began
 * (macOS) and blur the rest.
 */

import { addBox, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

test('turning the view with the right button leaves the focus alone; a right click sets it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  const picture = page.getByLabel('PBR presentation viewport');
  await expect(picture).toHaveAttribute('aria-busy', 'false', { timeout: 120_000 });
  await page.getByRole('tab', { name: 'Camera' }).click();
  const off = page
    .locator('.viz-field', { hasText: 'Aperture' })
    .getByRole('button', { name: 'Off' });
  await expect(off).toHaveAttribute('aria-pressed', 'true');

  const box = await picture.boundingBox();
  if (box === null) throw new Error('No picture');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 80, y + 30, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(off).toHaveAttribute('aria-pressed', 'true');

  await page.mouse.click(x, y, { button: 'right' });
  await expect(off).toHaveAttribute('aria-pressed', 'false');
});
