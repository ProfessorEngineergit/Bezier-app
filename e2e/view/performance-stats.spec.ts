/** The title bar performance readout: quiet, one line, and one physical swipe turns it once. */

import { openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

async function showReadout(page: import('@playwright/test').Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await page.getByRole('checkbox', { name: 'Show performance graph', exact: true }).check();
  await page.reload();
  await openApp(page);
}

test('the readout is switched in Settings, and a right click on the title bar switches it too', async ({
  page,
}) => {
  await openApp(page);
  const readout = page.getByRole('button', { name: /^Performance:/ });
  await expect(readout).toHaveCount(0);
  // A right click anywhere on the bar (free area or project name) toggles the readout directly,
  // without a menu.
  await page.locator('.titlebar__free').click({ button: 'right', position: { x: 20, y: 20 } });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(readout).toBeVisible();
  await page
    .locator('.titlebar__name, .titlebar')
    .first()
    .click({ button: 'right', position: { x: 4, y: 4 } });
  await expect(readout).toHaveCount(0);

  await showReadout(page);
  await expect(readout).toBeVisible();
  // No tooltip.
  await expect(readout).not.toHaveAttribute('title');
});

test('a long momentum tail turns one metric, as a roller, and scrolling back returns', async ({
  page,
}) => {
  await showReadout(page);
  const readout = page.getByRole('button', { name: /^Performance:/ });
  await readout.hover();
  await expect(readout).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.performance-graph__label')).toHaveText('Frame time');
  await expect(page.locator('.performance-graph__value')).toHaveText(/\d ms$/);
  await expect
    .poll(() => page.locator('.performance-graph__trace').getAttribute('d'))
    .toContain('C');
  // One line, as tall as the controls beside it.
  expect((await readout.boundingBox())?.height).toBeLessThanOrEqual(30);

  await page.mouse.wheel(0, 90);
  await expect(readout).toHaveAttribute('aria-label', /Frame cadence/);
  // Both lines are faces of one bar: a quarter turn each, no fading or blurring.
  const out = page.locator('.performance-graph__out');
  await expect(out).toHaveCSS('animation-name', 'performance-roll-out');
  const last = await out.evaluate((el) => el.getAnimations()[0]?.effect?.getKeyframes().at(-1));
  expect(String(last?.transform)).toContain('90deg');
  expect(String(last?.filter ?? 'none')).toBe('none');

  await page.evaluate(async () => {
    const element = document.querySelector('.performance-graph');
    if (!element) throw new Error('No readout');
    for (let i = 0; i < 30; i++) {
      element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 45, bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
  });
  await expect(readout).toHaveAttribute('aria-label', /Frame cadence/);
  await expect(page.locator('.performance-graph__label')).toHaveText('Frame cadence');
  await page.screenshot({ path: test.info().outputPath('quiet-stats.png') });

  await page.waitForTimeout(320);
  await page.mouse.wheel(0, -80);
  await expect(readout).toHaveAttribute('aria-label', /Frame time/);
  await expect(page.locator('.performance-graph__in')).toHaveCount(0);
});

test('turning the other way does not wait for the first swipe to die down', async ({ page }) => {
  await showReadout(page);
  const readout = page.getByRole('button', { name: /^Performance:/ });
  await readout.hover();
  await expect(readout).toHaveAttribute('aria-label', /Frame time/);
  // One unbroken stream of wheel events: down, then straight back up with no pause between.
  await page.evaluate(async () => {
    const element = document.querySelector('.performance-graph');
    if (!element) throw new Error('No readout');
    const send = (deltaY: number) =>
      element.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
    for (let i = 0; i < 6; i++) {
      send(40);
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    }
    for (let i = 0; i < 6; i++) {
      send(-40);
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    }
  });
  await expect(readout).toHaveAttribute('aria-label', /Frame time/);
});
