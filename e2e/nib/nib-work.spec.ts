/** Nib in use: how work shows on the island, and pushing him away. */

import type { Page } from '@playwright/test';
import { addBox, expectSaid, openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

const island = (page: Page) => page.locator('.nib-island');

/** Reports work as the app does (`island-feed.ts`). Served by the dev server, so this is its module. */
const report = (page: Page, tasks: unknown[]) =>
  page.evaluate(async (list) => {
    const path = '/src/island/island-feed.ts';
    const feed = await import(/* @vite-ignore */ path);
    feed.tellIsland({ kind: 'tasks', tasks: list });
  }, tasks);

test('work shows the label, the percentage and a bar of whole cells below', async ({ page }) => {
  await openApp(page);
  await report(page, [{ label: 'Importing part.step', progress: 0.5 }]);
  const line = island(page).locator('.nib-island__line');
  await expect(line).toHaveAttribute('data-working', '', { timeout: 5000 });
  await expect(line).toContainText('Importing part.step');
  await expect(line.locator('.nib-island__percent')).toHaveText('50,00%');
  const meter = await line.locator('.nib-island__meter').boundingBox();
  const fill = await line.locator('.nib-island__fill').boundingBox();
  if (meter === null || fill === null) throw new Error('no bar on screen');
  expect(meter.height).toBeGreaterThanOrEqual(10);
  expect(fill.width).toBe(144);
  await page.screenshot({ path: test.info().outputPath('work.png') });
  await report(page, []);
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
});

test('work of unknown length moves without a number', async ({ page }) => {
  await openApp(page);
  await report(page, [{ label: 'Opening project' }]);
  const line = island(page).locator('.nib-island__line');
  await expect(line.locator('.nib-island__fill[data-unknown]')).toBeVisible({ timeout: 5000 });
  await expect(line.locator('.nib-island__percent')).toHaveCount(0);
});

test('a two-finger push sends a message away, a nudge does not', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await page.locator('.rail__icon').filter({ hasText: 'Thread' }).click();
  await expectSaid(page, 'round wall');
  const box = await page.locator('.nib-island__shell').boundingBox();
  if (box === null) throw new Error('nothing to push');
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.wheel(0, 20);
  await page.waitForTimeout(300);
  await expect(island(page)).not.toHaveAttribute('data-shape', 'hidden');
  await page.mouse.wheel(0, 50);
  await page.mouse.wheel(0, 50);
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
});

/** Where the camera stands, through the test hook (`bezier.e2e`). */
const pose = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify(
      (
        window as unknown as { __bezierViewport: { cameraView(): unknown } }
      ).__bezierViewport.cameraView(),
    ),
  );

test('the rest of the push that sends him away does not turn the view', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await addBox(page);
  await page.locator('.rail__icon').filter({ hasText: 'Thread' }).click();
  await expectSaid(page, 'round wall');
  const pill = await page.locator('.nib-island__shell').boundingBox();
  if (pill === null) throw new Error('nothing to push');
  // Hovered, he opens into a card that reaches down over the view.
  await page.mouse.move(pill.x + pill.width / 2, pill.y + 20);
  await expect(island(page)).toHaveAttribute('data-shape', 'card');
  await page.waitForTimeout(500);
  const card = await page.locator('.nib-island__shell').boundingBox();
  if (card === null) throw new Error('no card');
  await page.mouse.move(card.x + card.width / 2, card.y + card.height - 12);
  // The view may still be gliding after the tool opened.
  let before = await pose(page);
  await expect
    .poll(async () => {
      const now = await pose(page);
      const same = now === before;
      before = now;
      return same;
    })
    .toBe(true);
  // One push: it sends him away, and its momentum goes on over the view. Sent from the page at a
  // steady pace, since the test runner's own steps can take longer than a pause between pushes.
  await page.evaluate(
    async (at) => {
      for (let i = 0; i < 12; i++) {
        const target = document.elementFromPoint(at.x, at.y);
        target?.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: 40,
            clientX: at.x,
            clientY: at.y,
            bubbles: true,
            cancelable: true,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    },
    { x: card.x + card.width / 2, y: card.y + card.height - 12 },
  );
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
  expect(await pose(page)).toBe(before);
  // A new scroll after a pause turns the view again.
  await page.waitForTimeout(400);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 40);
  await expect.poll(() => pose(page)).not.toBe(before);
});

test('dragging him upward sends a message away, and is no click', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await page.locator('.rail__icon').filter({ hasText: 'Thread' }).click();
  await expectSaid(page, 'round wall');
  const box = await page.locator('.nib-island__shell').boundingBox();
  if (box === null) throw new Error('nothing to drag');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 60, { steps: 6 });
  await page.mouse.up();
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
});

test('opening a project shows its progress in the bar above the loading screen', async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(async () => {
    const path = '/src/boot-loader.ts';
    const boot = await import(/* @vite-ignore */ path);
    boot.beginLoading({ belowBar: true, immediate: true });
  });
  await report(page, [{ label: 'Opening project', progress: 0.42 }]);
  await expect(island(page)).toHaveAttribute('data-kind', 'task', { timeout: 5000 });
  await expect(island(page)).toHaveCSS('opacity', '1');
  await expect(island(page).locator('.nib-island__lineText')).toHaveText('Opening project');
});
