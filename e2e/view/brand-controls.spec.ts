/** Brand actions are neutral in every workspace, and the accent is white in the dark theme. */
import { openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

async function accent(page: import('@playwright/test').Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        accent: style.getPropertyValue('--accent').trim(),
        font: style.fontFamily,
      };
    });
}

async function switchTo(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
}

/**
 * The brand font must actually load, not just be named: the other checks read `font-family`, which
 * passes even when the file 404s and a fallback font is used.
 */
test('the brand font loads and no @font-face fails', async ({ page }) => {
  await page.goto('/');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      usable: document.fonts.check('16px "Archivo Brand"'),
      failed: [...document.fonts].filter((face) => face.status === 'error').map((f) => f.family),
    };
  });
  expect(fonts.failed).toEqual([]);
  expect(fonts.usable).toBe(true);
});

test('Learn actions use the brand font and silver action', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Learn', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
  expect((await accent(page, '.lessons-button--primary')).accent).toBe('#ececee');
  expect((await accent(page, '.lessons-button--primary')).font).toContain('Archivo');
  await page.screenshot({ path: test.info().outputPath('bezier-brand-learn.png') });
});

test('Modeling and Drawings use the neutral action', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await expect(page.locator('.workspace')).toHaveAttribute('data-workspace', 'design');
  expect((await accent(page, '.workspace')).accent).toBe('#e8e8ea');
  await page.screenshot({ path: test.info().outputPath('bezier-brand-modeling.png') });

  await switchTo(page, 'Drawings');
  expect((await accent(page, '.dwg-primary')).accent).toBe('#e8e8ea');
  await page.screenshot({ path: test.info().outputPath('bezier-brand-drawings.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  expect((await accent(page, '.dwg-primary')).accent).toBe('#29292b');
});

test('Visualize uses the neutral action', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await switchTo(page, 'Visualize');
  expect((await accent(page, '.viz__primary')).accent).toBe('#e8e8ea');
  await page.screenshot({ path: test.info().outputPath('bezier-brand-visualize.png') });
});

test('Simulation takes the accent, which is white', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await switchTo(page, 'Simulation');
  await expect(page.locator('.workspace')).toHaveAttribute('data-workspace', 'simulation');
  // The last step of a workspace takes the accent, white in the dark theme.
  expect((await accent(page, '.sim-solve')).accent).toBe('#f2f2f4');
  await page.screenshot({ path: test.info().outputPath('bezier-brand-simulation.png') });
});

test('Settings use Archivo and the rounded neutral controls', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  const settings = page.getByRole('region', { name: 'Preferences' });
  await expect(settings).toBeVisible();
  expect((await accent(page, '.preferences-page')).font).toContain('Archivo');
  await page.screenshot({ path: test.info().outputPath('bezier-brand-settings.png') });
});

test('the browser is told which colours its own controls are drawn in', async ({ page }) => {
  // Native controls (selects, scrollbars) follow the declared color scheme. Without it, Linux drew
  // them white under the interface's light text.
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
});
