/**
 * A sketch drawn next to another snaps to it exactly: the pointer snaps to the other sketch's
 * corners and lines as to its own (`packages/ui/src/sketch-docking.ts`), so adjacent rectangles
 * leave no sliver.
 */

import { canvasRect, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

test('a second sketch snaps to the corners and edges of the first', async ({ page }) => {
  await openApp(page);
  const rect = await canvasRect(page);
  const at = (x: number, y: number) => [rect.x + rect.width * x, rect.y + rect.height * y] as const;

  // Squared to Top, Sketch starts on XY directly, both times.
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  await railButton(page, 'Rectangle').click();
  await railButton(page, 'Diagonal').click();
  await page.mouse.click(...at(0.41, 0.43));
  await page.mouse.click(...at(0.63, 0.67));
  await railButton(page, 'Finish Sketch').click();
  await expect(railButton(page, 'Sketch')).toBeVisible();

  // A new sketch on the same plane: the first is not part of it but is still a snap target.
  await railButton(page, 'Sketch').click();
  await expect(
    page.locator('.rail--left .rail__label', { hasText: 'Finish Sketch' }).locator('.rail__detail'),
  ).toHaveText('XY plane');
  await railButton(page, 'Line').click();
  await page.mouse.move(...at(0.63, 0.67));
  await expect(page.locator('.sketch-snap')).toHaveText('Endpoint');
  // Partway along its top edge, slightly off it: snaps onto the edge.
  await page.mouse.move(rect.x + rect.width * 0.47, rect.y + rect.height * 0.43 + 2);
  await expect(page.locator('.sketch-snap')).toHaveText('On sketch');
});
