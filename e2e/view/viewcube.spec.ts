/**
 * The orientation cube: the face label pointing at the viewer must match the view direction, and
 * clicking a face must turn the view to it. Asserted on which labelled face points at the viewer,
 * not on CSS axes.
 */

import { openApp } from '../app.js';
import { expect, test } from '../fixtures.js';

/** The label on the cube face currently pointing at the viewer. */
async function forwardFace(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const cube = document.querySelector('.viewcube__cube');
    if (cube === null) return '';
    const parent = new DOMMatrix(getComputedStyle(cube).transform);
    let best = '';
    let bestZ = -2;
    for (const face of document.querySelectorAll('.viewcube__face')) {
      const m = parent.multiply(new DOMMatrix(getComputedStyle(face).transform));
      if (m.m33 > bestZ) {
        bestZ = m.m33;
        best = face.textContent ?? '';
      }
    }
    return best;
  });
}

test('shows all six faces', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.viewcube__face')).toHaveCount(6);
});

test('clicking a face swings that view square onto the screen', async ({ page }) => {
  await openApp(page);

  // Clicks are dispatched on the element rather than aimed with the mouse: faces on the far side
  // are occluded and unclickable. What is tested is the face-to-view mapping, which every face has.
  //
  // Top and Bottom are the singular case for a naive lookAt, given the camera's up axis.
  for (const view of ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom']) {
    await page.evaluate((label) => {
      const face = [...document.querySelectorAll('.viewcube__face')].find(
        (element) => element.textContent === label,
      );
      (face as HTMLElement | undefined)?.click();
    }, view);
    // Polled: the swing is an animation of machine-dependent length.
    await expect.poll(() => forwardFace(page)).toBe(view);
  }
});

test('the default view shows the three faces the reference shows', async ({ page }) => {
  await openApp(page);
  // The starting view looks down on the front-right corner, so Front, Right and Top are in view, as
  // in the reference.
  const visible = await page.evaluate(() => {
    const cube = document.querySelector('.viewcube__cube');
    const parent = new DOMMatrix(getComputedStyle(cube as Element).transform);
    const facing: string[] = [];
    for (const face of document.querySelectorAll('.viewcube__face')) {
      const m = parent.multiply(new DOMMatrix(getComputedStyle(face).transform));
      if (m.m33 > 0.05) facing.push(face.textContent ?? '');
    }
    return facing.sort();
  });
  expect(visible).toEqual(['Front', 'Right', 'Top']);
});

test('an axis view opens Sketch directly on its matching plane', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(600);

  const exit = page.getByRole('button', { name: 'Finish Sketch', exact: true });
  const guard = page
    .locator('.rail--left .rail__label', { hasText: 'Finish Sketch' })
    .locator('.rail__detail');
  await expect(guard).toHaveText('XY plane');
  expect(await forwardFace(page)).toBe('Top');

  await exit.click();
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await expect(guard).toHaveText('XY plane');

  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await page.getByRole('button', { name: 'Diagonal', exact: true }).click();
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('viewport canvas missing');
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await expect(page.getByRole('button', { name: 'Finish Sketch', exact: true })).toBeEnabled();
});
