/**
 * Space squaring up the view, the cube's edge and corner zones, Shift-drag selection and the input
 * presets in Settings. The view is read from the orientation cube, not the camera; see
 * `viewcube.spec.ts`.
 */

import type { Page } from '@playwright/test';
import { addBox, canvasRect, cubeFacing, openApp, screenPointOf, selectionCount } from '../app.js';
import { expect, test } from '../fixtures.js';

/** Each cube face with how squarely it points at the viewer, 1 being head on. */
async function facing(page: Page): Promise<Record<string, number>> {
  return cubeFacing(page);
}

async function headOn(page: Page): Promise<string> {
  const faces = await facing(page);
  return Object.entries(faces).find(([, z]) => z > 0.98)?.[0] ?? '';
}

/**
 * Waits until the cube stops turning: the same orientation three times running, a few frames
 * apart. A fixed wait reads the camera mid-turn on slow machines.
 */
async function settled(page: Page, from?: string): Promise<void> {
  // Wait for the turn to start first: a slow machine starts late, and three identical readings of
  // the old pose would pass as settled.
  if (from !== undefined) {
    await expect
      .poll(async () => JSON.stringify(await facing(page)), { timeout: 5_000 })
      .not.toBe(from)
      .catch(() => undefined);
  }
  let last = '';
  let same = 0;
  for (let tries = 0; tries < 100 && same < 3; tries++) {
    await page.waitForTimeout(80);
    const now = JSON.stringify(await facing(page));
    same = now === last ? same + 1 : 0;
    last = now;
  }
}

/** Turns the camera slightly off whatever it is square to, with an orbit drag. */
async function nudge(page: Page): Promise<void> {
  const before = JSON.stringify(await facing(page));
  const rect = await canvasRect(page);
  const x = rect.x + rect.width * 0.3;
  const y = rect.y + rect.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 60, y + 30, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await settled(page, before);
}

async function clickZone(page: Page, sides: string): Promise<void> {
  const before = JSON.stringify(await facing(page));
  await page.evaluate((zone) => {
    (document.querySelector(`.viewcube__zone[data-zone="${zone}"]`) as HTMLElement | null)?.click();
  }, sides);
  await settled(page, before);
}

test('Space over nothing squares up to the side the view is nearest to', async ({ page }) => {
  await openApp(page);
  expect(await headOn(page)).toBe('');
  // From the angled view a test project opens with, the nearest side is the front.
  await page.keyboard.press('Space');
  await expect.poll(() => headOn(page)).toBe('Front');
});

test('Space squares a nudged view back up to the side it is nearest to', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const face = [...document.querySelectorAll('.viewcube__face')].find(
      (element) => element.textContent?.trim() === 'Front',
    );
    (face as HTMLElement | undefined)?.click();
  });
  await expect.poll(() => headOn(page)).toBe('Front');
  await nudge(page);
  expect(await headOn(page)).toBe('');
  await page.keyboard.press('Space');
  await expect.poll(() => headOn(page)).toBe('Front');
});

test('an edge of the cube looks along it, at 45 degrees to both sides', async ({ page }) => {
  await openApp(page);
  const zone = await page
    .locator('.viewcube__zone:not([data-corner])')
    .first()
    .getAttribute('data-zone');
  const [a, b] = (zone ?? '').split('-');
  await clickZone(page, zone ?? '');
  const label = (side: string | undefined) => (side ?? '').replace(/^./, (c) => c.toUpperCase());
  // Polled to the end state: the turn is an animation of machine-dependent length.
  await expect
    .poll(async () => {
      const faces = await facing(page);
      return [faces[label(a)], faces[label(b)]].map((z) => Math.round((z ?? 0) * 10) / 10);
    })
    .toEqual([0.7, 0.7]);
});

test('a corner of the cube looks from between three sides', async ({ page }) => {
  await openApp(page);
  const zone = await page.locator('.viewcube__zone[data-corner]').first().getAttribute('data-zone');
  await clickZone(page, zone ?? '');
  await expect
    .poll(async () =>
      Object.values(await facing(page))
        .filter((z) => z > 0.5)
        .map((z) => Math.round(z * 10) / 10),
    )
    .toEqual([0.6, 0.6, 0.6]);
  // Space then squares up to the first of the three.
  await page.keyboard.press('Space');
  const first = (zone ?? '').split('-')[0] ?? '';
  await expect.poll(() => headOn(page)).toBe(first.replace(/^./, (c) => c.toUpperCase()));
});

test('Shift-drag around the part selects its faces, like a desktop', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const rect = await canvasRect(page);
  const corners = [
    { x: -5, y: -5, z: -5 },
    { x: 45, y: 25, z: 20 },
  ].map((world) => screenPointOf(rect, world));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  // Well outside the part on every side, left to right: a window selection.
  const left = Math.min(...xs) - 80;
  const right = Math.max(...xs) + 80;
  const top = Math.min(...ys) - 80;
  const bottom = Math.max(...ys) + 80;
  await page.keyboard.down('Shift');
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move((left + right) / 2, (top + bottom) / 2, { steps: 5 });
  await expect(page.locator('.viewport-marquee')).toHaveAttribute('data-mode', 'window');
  await page.mouse.move(right, bottom, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  expect(await selectionCount(page)).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.viewport-marquee')).toBeHidden();
});

test('a Shift-drag that misses everything selects nothing', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const rect = await canvasRect(page);
  await page.keyboard.down('Shift');
  await page.mouse.move(rect.x + 20, rect.y + rect.height - 120);
  await page.mouse.down();
  await page.mouse.move(rect.x + 90, rect.y + rect.height - 60, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  expect(await selectionCount(page)).toBe(0);
});

test('dragging an empty area selects without Shift, replaces, and Shift adds', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  const rect = await canvasRect(page);
  const start = { x: rect.x + rect.width * 0.16, y: rect.y + rect.height * 0.12 };
  const end = { x: rect.x + rect.width * 0.84, y: rect.y + rect.height * 0.83 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(page.locator('.viewport-marquee')).toHaveAttribute('data-mode', 'window');
  await page.mouse.up();
  const count = await selectionCount(page);
  expect(count).toBeGreaterThanOrEqual(3);
  const emptyDrag = async () => {
    await page.mouse.move(rect.x + 15, rect.y + rect.height - 100);
    await page.mouse.down();
    await page.mouse.move(rect.x + 60, rect.y + rect.height - 40, { steps: 5 });
    await page.mouse.up();
  };
  await page.keyboard.down('Shift');
  await emptyDrag();
  await page.keyboard.up('Shift');
  expect(await selectionCount(page)).toBe(count);
  await emptyDrag();
  expect(await selectionCount(page)).toBe(0);
});

test('the Blender key preset gives the number row its views', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('ControlOrMeta+,');
  const preferences = page.getByRole('region', { name: 'Preferences' });
  await preferences.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await preferences.getByLabel('Keys like').selectOption('blender');
  await page.keyboard.press('Escape');
  await expect(preferences).toBeHidden();

  await page.keyboard.press('7');
  await expect.poll(() => headOn(page)).toBe('Top');
  await page.keyboard.press('1');
  await expect.poll(() => headOn(page)).toBe('Front');
});

test('one key can be changed on its own and put back', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('ControlOrMeta+,');
  const preferences = page.getByRole('region', { name: 'Preferences' });
  await preferences.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await preferences.getByRole('button', { name: 'Shortcut for Right view', exact: true }).click();
  await page.keyboard.press('Shift+Q');
  await expect(preferences.getByText('Changed', { exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('Shift+Q');
  await expect.poll(() => headOn(page)).toBe('Right');

  await page.keyboard.press('ControlOrMeta+,');
  await preferences.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await preferences.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(preferences.getByText('Changed', { exact: true })).toHaveCount(0);
});

test('the navigation preset and a single mouse action can be changed', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('ControlOrMeta+,');
  const preferences = page.getByRole('region', { name: 'Preferences' });
  await preferences.getByRole('button', { name: 'Interaction', exact: true }).click();
  await preferences.getByLabel('Navigate like').selectOption('blender');
  await expect(preferences.getByLabel('Orbit with')).toHaveValue('preset');
  await expect(preferences.getByLabel('Orbit with').locator('option:checked')).toHaveText(
    /Blender: Middle/,
  );
  // Each action is pictured as well as named, and the pictures follow the choice (audit F-021).
  const cards = preferences
    .getByRole('list', { name: 'How the camera moves' })
    .getByRole('listitem');
  await expect(cards).toHaveText([/^Orbit.*Middle drag$/, /^Pan.*Shift.*Middle drag$/, /^Zoom/]);
  await preferences.getByLabel('Pan with').selectOption({ label: 'Right drag' });
  await expect(preferences.getByText('Changed', { exact: true })).toBeVisible();
  await expect(cards.nth(1)).toHaveText(/^PanRight drag$/);
  await page.screenshot({ path: test.info().outputPath('navigation-gestures.png') });
  // The choice survives a reload.
  await openApp(page);
  // Retry until the sheet opens: right after a reload, on a slow machine, the shortcut can arrive
  // before the key handler is installed.
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+,');
    await expect(preferences).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: process.env.CI ? 30_000 : 10_000 });
  await preferences.getByRole('button', { name: 'Interaction', exact: true }).click();
  await expect(preferences.getByLabel('Navigate like')).toHaveValue('blender');
  await expect(preferences.getByText('Changed', { exact: true })).toBeVisible();
});

test('the desktop menu runs a view by name', async ({ page }) => {
  await openApp(page);
  // What the Mac app's View menu sends for Cmd+4.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('bezier:action', { detail: 'view-top' })),
  );
  await expect.poll(() => headOn(page)).toBe('Top');
});

test('the view is a parallel one on every place of the cube and a lens elsewhere', async ({
  page,
}) => {
  await openApp(page);
  const squared = () => page.locator('.viewcube--squared').count();
  // From the angled view a project opens with: perspective.
  expect(await squared()).toBe(0);
  await page.evaluate(() => {
    const face = [...document.querySelectorAll('.viewcube__face')].find(
      (element) => element.textContent?.trim() === 'Front',
    );
    (face as HTMLElement | undefined)?.click();
  });
  await expect.poll(squared).toBe(1);
  // Turned off-axis by hand: perspective again, not a slanted parallel view.
  await nudge(page);
  await expect.poll(squared).toBe(0);
  // Edges and corners of the cube give parallel views too.
  const zone = await page
    .locator('.viewcube__zone:not([data-corner])')
    .first()
    .getAttribute('data-zone');
  await clickZone(page, zone ?? '');
  await expect.poll(squared).toBe(1);
  // Pointer on a cube corner plus Space: that corner.
  await nudge(page);
  await expect.poll(squared).toBe(0);
  const corner = page.locator('.viewcube__zone[data-corner]').first();
  // Hover via event: a corner at the back is behind a face, so the pointer cannot reach it.
  await corner.dispatchEvent('pointerover', { bubbles: true });
  await page.keyboard.press('Space');
  await expect.poll(squared).toBe(1);
});
