/**
 * How rail categories open. A flyout adds a second column and leaves the rail in place; a mode
 * (Sketch) replaces the rail and offers a way out. Geometry is asserted in pixels, since a flyout
 * that is not level with its button is wrong even when it appears.
 */

import { addBox, canvasRect, openApp, quickSettings, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

test('a category opens a second column beside the rail, not in place of it', async ({ page }) => {
  await openApp(page);

  const categories = page
    .locator('.rail--left .rail__icons')
    .filter({ has: railButton(page, 'Transform') });
  const before = await categories.boundingBox();

  await railButton(page, 'Transform').click();

  const flyout = page.locator('.rail--left .rail__flyout');
  await expect(flyout).toBeVisible();
  // Every command in the category, with the category button unmoved. Transform lists the six with
  // a working operation; disabled commands are not listed. Each label ends with its key cap
  // ("ScaleS").
  await expect(flyout.locator('.rail__label')).toHaveText([
    /^Move\/Rotate/,
    /^Scale/,
    /^Mirror/,
    /^Pattern/,
    /^Align/,
    /^Joint/,
  ]);
  expect(await categories.boundingBox()).toEqual(before);
});

test('items is the only project panel button in the modeling workspace', async ({ page }) => {
  await openApp(page);

  await expect(railButton(page, 'Items')).toBeVisible();
  await expect(railButton(page, 'Modeling')).toHaveCount(0);
});

test('the flyout starts level with the button that opened it', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Transform').click();

  const parent = await railButton(page, 'Transform').boundingBox();
  const first = await page.locator('.rail--left .rail__flyout .rail__label').first().boundingBox();
  expect(parent).not.toBeNull();
  expect(first).not.toBeNull();

  // The flyout column sits one row-pitch right of its parent, so the two bands overlap by two
  // pixels rather than leaving a gap.
  expect(first?.y).toBeCloseTo(parent?.y ?? 0, 0);
  expect((first?.x ?? 0) - (parent?.x ?? 0)).toBeGreaterThan(24);
});

test('opening a flyout quiets the rest of the rail but not the other side', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.rail--left .rail__label').first()).toBeVisible();

  await railButton(page, 'Transform').click();

  // The only labels left on this side are the flyout's.
  const labels = page.locator('.rail--left .rail__label');
  const inFlyout = page.locator('.rail--left .rail__flyout .rail__label');
  expect(await labels.count()).toBe(await inFlyout.count());

  // The right rail is about the view, not the active command, and stays as it is.
  await expect(page.locator('.rail--right .rail__label').first()).toBeVisible();
});

test('sketch replaces the rail instead, and offers the way back out', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();

  // No second column: this is a mode.
  await expect(page.locator('.rail--left .rail__flyout')).toHaveCount(0);
  await expect(railButton(page, 'Line')).toBeVisible();
  await expect(railButton(page, 'Transform')).toHaveCount(0);

  const exit = railButton(page, 'Finish Sketch');
  await expect(exit).toBeVisible();
  await exit.click();
  await expect(railButton(page, 'Transform')).toBeVisible();
});

test('Scale works on a picked body and opens its factor', async ({ page }) => {
  // Scale is a working tool on the rail, not a disabled placeholder.
  await openApp(page);
  await railButton(page, 'Tools').click();
  await railButton(page, 'Extrude').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await railButton(page, 'Transform').click();
  const scale = railButton(page, 'Scale');
  await expect(scale).toBeEnabled();
  await scale.click();
  await expect(page.locator('.inspector .move-gizmo__heading strong')).toHaveText('Scale');
  await expect(page.locator('.inspector').getByLabel('Factor')).toHaveValue('1');
});

test('future workspaces and power tools stay out of the modelling surface', async ({ page }) => {
  await openApp(page);

  for (const label of ['Visualization', 'Drawings', 'Search', 'History', 'Screenshot']) {
    await expect(railButton(page, label)).toHaveCount(0);
  }

  await railButton(page, 'Tools').click();
  for (const label of ['Replace Face']) {
    await expect(railButton(page, label)).toHaveCount(0);
  }
});

test('a variant flyout takes the label column instead of landing on top of it', async ({
  page,
}) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  // The variants belong to a command that needs a plane, so pick one first: the three datum planes
  // sit at the centre of the view.
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Rectangle').click();

  const flyout = page.locator('.rail--left .rail__flyout');
  await expect(flyout).toBeVisible();
  await expect(flyout.locator('.rail__label')).toHaveCount(2);

  // The flyout sits one column right of the icon band, where that band's label pills are, so those
  // labels must hide or the two sets of names overlap.
  await expect(
    page.locator('.rail--left .rail__group:has(.rail__flyout) > .rail__labels'),
  ).toBeHidden();

  // Other groups keep their labels; only the band that opened the flyout gives way.
  await expect(page.locator('.rail--left .rail__labels').first()).toBeVisible();
});

test('an open popover paints over the rail labels and the view cube', async ({ page }) => {
  await openApp(page);
  await quickSettings(page, 'Display');
  await expect(page.locator('.popover')).toBeVisible();

  // Checked by hit-testing, not geometry: the popover is anchored over the label column, so overlap
  // is expected and only being covered is a fault. Label pills each create a stacking context and
  // come later in the group; the cube has its own layer.
  const covered = await page.evaluate(() => {
    const popover = document.querySelector('.popover');
    if (popover === null) return ['no popover'];
    const area = popover.getBoundingClientRect();
    const covering: string[] = [];
    const probe = (element: Element, name: string) => {
      const box = element.getBoundingClientRect();
      const x = Math.min(Math.max(box.left + box.width / 2, area.left + 2), area.right - 2);
      const y = Math.min(Math.max(box.top + box.height / 2, area.top + 2), area.bottom - 2);
      const overlaps = x > box.left && x < box.right && y > box.top && y < box.bottom;
      if (!overlaps) return;
      const top = document.elementFromPoint(x, y);
      if (top !== null && top !== popover && !popover.contains(top)) covering.push(name);
    };
    for (const label of document.querySelectorAll('.rail--right .rail__labels .rail__label')) {
      if (getComputedStyle(label).visibility !== 'hidden') probe(label, 'rail label');
    }
    const cube = document.querySelector('.viewcube');
    if (cube !== null) probe(cube, 'view cube');
    return covering;
  });
  expect(covered).toEqual([]);
});

test('Loft and Sweep are in Tools and say what they need (audit F-032, F-033)', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  for (const [name, needs] of [
    ['Loft', 'A loft goes between two sketches'],
    ['Sweep', 'A sweep needs a sketch with a closed shape and a sketch with an open path'],
    ['Wrap', 'Wrap lays a sketch round a round face'],
  ] as const) {
    const button = railButton(page, name);
    if (!(await button.isVisible())) await railButton(page, 'Tools').click();
    await button.click();
    await expect(page.getByText(needs)).toBeVisible();
  }
});
