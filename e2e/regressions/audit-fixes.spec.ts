/**
 * Regression tests for the audit findings, one test per finding. Test names start with the
 * finding's ID.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import {
  addBox,
  canvasRect,
  expectSaid,
  openApp,
  openItems,
  pickAt,
  quickSettings,
  railButton,
  said,
  screenPointOf,
} from '../app.js';
import { expect, test } from '../fixtures.js';
import { twoColourPng } from '../png.js';

/** The label on the cube face currently pointing at the viewer. */
async function forwardFace(page: Page): Promise<string> {
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

/** Sets a preference before the app starts, after the fixture has set its own. */
async function prefer(page: Page, key: string, value: unknown) {
  await page.addInitScript(
    ({ key, value }) => {
      if (window !== window.top) return;
      const name = 'bezier.preferences';
      const stored = JSON.parse(localStorage.getItem(name) ?? '{}') as Record<string, unknown>;
      const values = (stored.values as Record<string, unknown> | undefined) ?? stored;
      values[key] = value;
      localStorage.setItem(name, JSON.stringify(stored.values ? stored : values));
    },
    { key, value },
  );
}

/** A cylinder of radius 10 and height 10, written by the real kernel. */
const CYLINDER_STEP = readFileSync(
  fileURLToPath(new URL('../fixtures-files/cylinder-r10-h10.step', import.meta.url)),
);

async function importFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({ name, mimeType, buffer });
}

test("B3: the cube's axis arms start at its corner, not a few pixels to one side of it", async ({
  page,
}) => {
  await openApp(page);
  // From below, the arms leave from the near corner, so nothing is foreshortened.
  await page.getByRole('button', { name: 'Bottom', exact: true }).first().dispatchEvent('click');
  await expect.poll(() => forwardFace(page)).toBe('Bottom');
  await page.waitForTimeout(600);
  const measured = await page.evaluate(() => {
    // The whole drawn cube, bevels included; a single side is inset from the edge.
    const parts = [...document.querySelectorAll('.viewcube__cube > *')]
      .filter((element) => !/viewcube__axis/.test(element.className))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const box =
      parts.length === 0
        ? undefined
        : {
            left: Math.min(...parts.map((rect) => rect.left)),
            bottom: Math.max(...parts.map((rect) => rect.bottom)),
          };
    const arms = [...document.querySelectorAll('.viewcube__axis')].map((element) =>
      element.getBoundingClientRect(),
    );
    // Seen square on, the Y arm is the tall one and the X arm the wide one.
    const tall = arms
      .filter((arm) => arm.height > arm.width * 4)
      .sort((a, b) => b.height - a.height)[0];
    const wide = arms
      .filter((arm) => arm.width > arm.height * 4)
      .sort((a, b) => b.width - a.width)[0];
    return box === undefined || tall === undefined || wide === undefined
      ? null
      : {
          left: box.left,
          bottom: box.bottom,
          tallX: tall.left + tall.width / 2,
          wideY: wide.top + wide.height / 2,
        };
  });
  expect(measured).not.toBeNull();
  // The arms start at the cube's own corner: its left and bottom edges.
  expect(Math.abs((measured?.tallX ?? 0) - (measured?.left ?? 0))).toBeLessThan(3);
  expect(Math.abs((measured?.wideY ?? 0) - (measured?.bottom ?? 0))).toBeLessThan(3);
});

test('B2: a project opens looking from above, whatever view the last one was left in', async ({
  page,
}) => {
  await prefer(page, 'openView', 'top');
  await openApp(page);
  await expect.poll(() => forwardFace(page)).toBe('Top');
  await addBox(page);
  // Turn it, leave (the card thumbnail is taken from the corner) and come back.
  await page.getByRole('button', { name: 'Front', exact: true }).first().dispatchEvent('click');
  await expect.poll(() => forwardFace(page)).toBe('Front');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await page.locator('.tile__face').first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expect.poll(() => forwardFace(page)).toBe('Top');
});

test('A9: Space squares up to the side the view is nearest to, not to one picked a while ago', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  // Pick Back on the cube, then reach Front another way: two quarter turns.
  await page.getByRole('button', { name: 'Back', exact: true }).first().dispatchEvent('click');
  await expect.poll(() => forwardFace(page)).toBe('Back');
  await page.getByRole('button', { name: 'Rotate right' }).dispatchEvent('click');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Rotate right' }).dispatchEvent('click');
  await expect.poll(() => forwardFace(page)).toBe('Front');
  // With the pointer over empty space, Space keeps the front.
  await page.mouse.move(300, 760);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  expect(await forwardFace(page)).toBe('Front');
});

test('A2: a sketch has its number, and a second file of the same name gets one', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await openItems(page);
  const items = page.locator('.items-panel');
  // Sketch numbering itself is tested in feature-names.test.ts.
  await expect(items.getByText('Sketch 1', { exact: true })).toBeVisible();

  const png = twoColourPng(40, 20, [200, 40, 40], [40, 40, 200]);
  await importFile(page, 'plan.png', 'image/png', png);
  await expect(page.getByRole('complementary', { name: 'Image' })).toBeVisible();
  await importFile(page, 'plan.png', 'image/png', png);
  await expect(items.getByText('plan', { exact: true })).toBeVisible();
  await expect(items.getByText('plan 2', { exact: true })).toBeVisible();
});

test('A1: a second picture stands beside the first, not on it', async ({ page }) => {
  await openApp(page);
  const png = twoColourPng(200, 100, [200, 40, 40], [40, 40, 200]);
  const panel = page.getByRole('complementary', { name: 'Image' });
  await importFile(page, 'one.png', 'image/png', png);
  await expect(panel.getByRole('textbox', { name: 'X', exact: true })).toHaveValue('0');
  await importFile(page, 'two.png', 'image/png', png);
  // 100 mm wide each with a 10 mm gap: the second is centred at 110 mm.
  await expect(panel.getByRole('textbox', { name: 'X', exact: true })).toHaveValue('110');
});

test('D8: a second notice goes under the first and does not replace it', async ({ page }) => {
  // With Nib off, notices are toasts stacked under the bar.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const key = 'bezier.preferences';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const prefs = (stored.values as Record<string, unknown> | undefined) ?? stored;
    prefs.nib = 'off';
    localStorage.setItem(key, JSON.stringify(stored.values ? stored : prefs));
  });
  await openApp(page);
  await importFile(page, 'a.png', 'image/png', Buffer.from('not a picture'));
  await importFile(page, 'b.png', 'image/png', Buffer.from('not a picture'));
  const notices = page.getByRole('region', { name: 'Notifications' }).locator('.toast');
  await expect(notices).toHaveCount(2);
  const first = await notices.nth(0).boundingBox();
  const second = await notices.nth(1).boundingBox();
  expect(first?.y ?? 0).toBeLessThan(second?.y ?? 0);
  await expect(notices.nth(0)).toContainText('a.png');
  await expect(notices.nth(1)).toContainText('b.png');
});

test('D8 with Nib: a second notice waits its turn and replaces nothing', async ({ page }) => {
  await openApp(page);
  await importFile(page, 'a.png', 'image/png', Buffer.from('not a picture'));
  await importFile(page, 'b.png', 'image/png', Buffer.from('not a picture'));
  const island = page.locator('.nib-island');
  await expectSaid(page, 'One more after this');
  await expect(island).toContainText('a.png');
  await island.getByRole('button', { name: 'Close' }).click();
  await expect(island).toContainText('b.png');
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('D9: a click above the search field leaves it, as a click below it does', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search projects' });
  await search.click();
  await expect(search).toBeFocused();
  // The strip beside the logo, above the field.
  const box = await search.boundingBox();
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) - 6, Math.max(4, (box?.y ?? 0) - 22));
  await expect(search).not.toBeFocused();
});

test('D2: the cross that closes a mini panel is level with its title', async ({ page }) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Measure').click();
  const panel = page.locator('.inspection-panel');
  await expect(panel).toBeVisible();
  const title = await panel.locator('.inspection-panel__drag').boundingBox();
  const cross = await panel.locator('.inspection-panel__close svg').boundingBox();
  const titleMiddle = (title?.y ?? 0) + (title?.height ?? 0) / 2;
  const crossMiddle = (cross?.y ?? 0) + (cross?.height ?? 0) / 2;
  expect(Math.abs(titleMiddle - crossMiddle)).toBeLessThan(1.5);
});

test('A14: a third click after a double-click keeps the body selected, and so does a second double-click', async ({
  page,
}) => {
  const { canvasRect, screenPointOf } = await import('../app.js');
  await openApp(page);
  await addBox(page);
  const at = screenPointOf(await canvasRect(page), { x: 20, y: 10, z: 15 });
  const toolbar = page.getByRole('toolbar', { name: 'Move and rotate' });

  await page.mouse.click(at.x, at.y, { clickCount: 3, delay: 50 });
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolbar).toHaveCount(0);

  // Two quick double-clicks in a row.
  await page.waitForTimeout(700);
  await page.mouse.click(at.x, at.y, { clickCount: 4, delay: 50 });
  await expect(toolbar).toBeVisible();
});

test('A6: deleting a body takes its move arrows with it', async ({ page }) => {
  const { doubleClickAt } = await import('../app.js');
  await openApp(page);
  await addBox(page);
  await doubleClickAt(page, { x: 20, y: 10, z: 15 });
  await expect(page.locator('.move-gizmo')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.move-gizmo')).toHaveCount(0);
});

test('A15: scrolling over a handle of a picture zooms the view, as scrolling beside it does', async ({
  page,
}) => {
  await openApp(page);
  await importFile(
    page,
    'plan.png',
    'image/png',
    twoColourPng(200, 100, [200, 40, 40], [40, 40, 200]),
  );
  const handle = page.locator('[data-handle="move"]');
  await expect(handle).toBeVisible();
  const corner = page.locator('[data-handle="corner-ne"]');
  const before = await corner.boundingBox();
  const at = await handle.boundingBox();
  await page.mouse.move((at?.x ?? 0) + 8, (at?.y ?? 0) + 8);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(600);
  const after = await corner.boundingBox();
  // The view moved, so the corner is elsewhere on screen.
  expect(
    Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.y ?? 0) - (before?.y ?? 0)),
  ).toBeGreaterThan(8);
});

test('D6: the variant a tool will give is marked in its list', async ({ page }) => {
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await page.locator('canvas.viewport').boundingBox();
  await page.mouse.click(
    (rect?.x ?? 0) + (rect?.width ?? 0) / 2,
    (rect?.y ?? 0) + (rect?.height ?? 0) / 2,
  );
  await railButton(page, 'Rectangle').click();
  await expect(railButton(page, 'Diagonal')).toHaveAttribute('data-chosen');
  await expect(railButton(page, 'Center')).not.toHaveAttribute('data-chosen');
  // Invoking the command again steps to the next variant, and the mark follows.
  await railButton(page, 'Rectangle').click();
  await expect(railButton(page, 'Center')).toHaveAttribute('data-chosen');
  await expect(railButton(page, 'Diagonal')).not.toHaveAttribute('data-chosen');
});

test('H1: the breadcrumb names the part of Community that is open', async ({ page }) => {
  const { onAlpha } = await import('../app.js');
  await onAlpha(page);
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: /^Community/ })
    .click();
  const place = page.getByRole('navigation', { name: 'Location' });
  await expect(place).toContainText('Community');
  await expect(place).toContainText('Wiki');
  // Lessons live on Learn (audit H3), so Community has Plugins, Wiki and Leaderboard.
  await expect(page.getByRole('radio', { name: 'Lessons' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Plugins' }).click();
  await expect(place).toContainText('Plugins');
});

test('G1: Settings reach from the sidebar to the window edge, and the page itself does not scroll', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  const measured = await page.evaluate(() => {
    const body = document.querySelector('.library__body');
    const side = document.querySelector('.preferences-page__side');
    const content = document.querySelector('.preferences-page__body');
    if (body === null || side === null || content === null) return null;
    const outer = body.getBoundingClientRect();
    return {
      sideLeft: side.getBoundingClientRect().left - outer.left,
      contentRight: outer.right - content.getBoundingClientRect().right,
      pageScrolls: body.scrollHeight > body.clientHeight + 1,
    };
  });
  expect(measured?.sideLeft).toBeLessThan(2);
  expect(measured?.contentRight).toBeLessThan(2);
  expect(measured?.pageScrolls).toBe(false);
});

// WebKit only (the desktop engine): looking exactly along Z the heading is within rounding of
// undefined, and JavaScriptCore rounds it differently from V8. Run with `pnpm e2e:webkit`.
test('B1: squaring up to a face that looks straight up arrives turning, and does not jump into place', async ({
  page,
}) => {
  const { canvasRect } = await import('../app.js');
  await openApp(page);
  await addBox(page);
  // Square on the top, turn the view away a little by hand, then press Space over the top face.
  await page.getByRole('button', { name: 'Top', exact: true }).first().dispatchEvent('click');
  await expect.poll(() => forwardFace(page)).toBe('Top');
  await page.waitForTimeout(500);
  const cube = await page.locator('.viewcube__cube').boundingBox();
  const grab = {
    x: (cube?.x ?? 0) + (cube?.width ?? 0) / 2,
    y: (cube?.y ?? 0) + (cube?.height ?? 0) / 2,
  };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 34, grab.y + 46, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const rect = await canvasRect(page);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  // The on-screen angle of the cube's Top face, per frame, from the key press on.
  const turns = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const cube = document.querySelector('.viewcube__cube');
        const top = [...document.querySelectorAll('.viewcube__face')].find(
          (face) => face.textContent === 'Top',
        );
        if (cube === null || top === undefined) {
          resolve([]);
          return;
        }
        const seen: number[] = [];
        const started = performance.now();
        const read = () => {
          const m = new DOMMatrix(getComputedStyle(cube).transform).multiply(
            new DOMMatrix(getComputedStyle(top).transform),
          );
          seen.push((Math.atan2(m.m12, m.m11) * 180) / Math.PI);
          if (performance.now() - started < 900) requestAnimationFrame(read);
          else resolve(seen);
        };
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }),
        );
        requestAnimationFrame(read);
      }),
  );
  expect(turns.length).toBeGreaterThan(10);
  const step = (i: number) => {
    const d = Math.abs((turns[i] ?? 0) - (turns[i - 1] ?? 0)) % 360;
    return Math.min(d, 360 - d);
  };
  // The last frame that still turned: an eased arrival ends in small steps, a jump does not.
  let last = 0;
  for (let i = 1; i < turns.length; i++) if (step(i) > 0.05) last = i;
  expect(last).toBeGreaterThan(3);
  expect(step(last)).toBeLessThan(4);
  // It did turn on the way: the corner view is not square to the top.
  expect(Math.abs((turns[0] ?? 0) - (turns[turns.length - 1] ?? 0))).toBeGreaterThan(10);
});

test('A11: the real solver answers, and the app does not say constraints are only kept', async ({
  page,
}) => {
  await openApp(page);
  expect(await page.evaluate(() => document.documentElement.dataset.solver)).toBe('real');
  await expect(page.getByText('Constraints are kept, not solved yet')).toHaveCount(0);
});

test('A12: no hidden line of a drawing lies on a visible one, where its dashes would fill in', async ({
  page,
}) => {
  await openApp(page);
  await importFile(page, 'cylinder.step', 'application/step', CYLINDER_STEP);
  await expect(said(page).first()).toContainText('Imported');
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
  await expect(page.locator('.drawing-paper g[data-view="front"] polyline')).not.toHaveCount(0);
  // From the front, the back half of a cylinder's rim lies exactly behind the front half, sampled
  // at different points. A dashed copy over the solid line would print solid on short edges.
  const overlaps = await page.evaluate(() => {
    const read = (p: Element) => (p.getAttribute('points') ?? '').split(' ').map(Number);
    const found: string[] = [];
    for (const view of document.querySelectorAll('.drawing-paper g[data-view]')) {
      const lines = [...view.querySelectorAll('polyline')];
      const visible = lines.filter((p) => !p.hasAttribute('stroke-dasharray')).map(read);
      const hidden = lines.filter((p) => p.hasAttribute('stroke-dasharray')).map(read);
      for (const h of hidden) {
        const middle = [
          ((h[0] ?? 0) + (h[h.length - 2] ?? 0)) / 2,
          ((h[1] ?? 0) + (h[h.length - 1] ?? 0)) / 2,
        ];
        const onVisible = visible.some((v) => {
          for (let i = 2; i + 1 < v.length; i += 2) {
            const ax = v[i - 2] ?? 0;
            const ay = v[i - 1] ?? 0;
            const ex = (v[i] ?? 0) - ax;
            const ey = (v[i + 1] ?? 0) - ay;
            const span = ex * ex + ey * ey || 1;
            const t = Math.max(
              0,
              Math.min(1, (((middle[0] ?? 0) - ax) * ex + ((middle[1] ?? 0) - ay) * ey) / span),
            );
            if (Math.hypot((middle[0] ?? 0) - ax - t * ex, (middle[1] ?? 0) - ay - t * ey) < 0.01)
              return true;
          }
          return false;
        });
        if (onVisible && h.length === 4)
          found.push(`${view.getAttribute('data-view')}: ${h.join(' ')}`);
      }
    }
    return found;
  });
  expect(overlaps).toEqual([]);
});

test('A10: with no tool in hand a drawn side is dragged, and the rectangle stays closed', async ({
  page,
}) => {
  // Top view, so the rectangle is square on screen.
  await prefer(page, 'openView', 'top');
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Rectangle').click();
  await railButton(page, 'Diagonal').click();
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  const lengths = page.getByRole('textbox', { name: /Length for sketch line/ });
  await expect(lengths).toHaveCount(2);
  const read = () =>
    lengths.evaluateAll((inputs) => inputs.map((i) => Number((i as HTMLInputElement).value)));
  const before = await read();
  // The first Escape drops the tool; a second would leave the sketch.
  await page.keyboard.press('Escape');
  await expect(railButton(page, 'Finish Sketch')).toBeVisible();

  // Drag the right side further right, above its middle where the length field takes the press.
  const side = { x: rect.x + rect.width * 0.6, y: rect.y + rect.height * 0.44 };
  await page.mouse.move(side.x, side.y);
  await page.mouse.down();
  await page.mouse.move(side.x + 40, side.y, { steps: 8 });
  await page.mouse.up();
  const after = await read();
  // One side grew and the other kept its length: the corners stayed joined.
  const grew = after.filter((value, i) => value > (before[i] ?? 0) + 1);
  const kept = after.filter((value, i) => Math.abs(value - (before[i] ?? 0)) < 0.01);
  expect(grew).toHaveLength(1);
  expect(kept).toHaveLength(1);

  // A single Undo puts the whole drag back.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  expect(await read()).toEqual(before);
});

test('A10: Escape in a sketch dimension is taken, and the next one leaves the sketch', async ({
  page,
}) => {
  // Top view, so the rectangle is square on screen.
  await prefer(page, 'openView', 'top');
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Rectangle').click();
  await railButton(page, 'Diagonal').click();
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await page.keyboard.press('Escape');
  // An Escape that is not handled is the one the desktop window uses to leave full screen.
  await page.evaluate(() => {
    const seen: boolean[] = [];
    (window as { __escapes?: boolean[] }).__escapes = seen;
    // Capture phase, since the field stops propagation; read after the event completes.
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') setTimeout(() => seen.push(event.defaultPrevented));
      },
      true,
    );
  });
  const field = page.getByRole('textbox', { name: /Length for sketch line/ }).first();
  await field.click();
  await field.fill('144');
  await page.keyboard.press('Escape');
  await expect(field).not.toBeFocused();
  await expect(railButton(page, 'Finish Sketch')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(railButton(page, 'Sketch')).toBeVisible();
  expect(await page.evaluate(() => (window as { __escapes?: boolean[] }).__escapes)).toEqual([
    true,
    true,
  ]);
});

test('A4: the model is drawn again when the browser hands the 3D view its graphics back', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  const rect = await canvasRect(page);
  // The colour at the centre of the view (the box), read from a real screenshot.
  const middle = async () => {
    const shot = await page.screenshot({
      clip: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: 1, height: 1 },
    });
    return page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0);
      return [...(context?.getImageData(0, 0, 1, 1).data ?? [])].slice(0, 3);
    }, shot.toString('base64'));
  };
  const before = await middle();
  // Simulate the browser reclaiming the context under memory pressure, then restoring it.
  const restored = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas.viewport') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    const lose = gl?.getExtension('WEBGL_lose_context');
    if (!gl || !lose) return false;
    lose.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 300));
    lose.restoreContext();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return !gl.isContextLost();
  });
  expect(restored).toBe(true);
  // The model must be drawn again without reopening the project.
  await expect.poll(middle).toEqual(before);
});

test('A3: opening a project never shows the empty editor before its loading screen', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('.library')).toBeVisible();
  // On every frame while the project opens, the editor and the loading screen appear together or
  // not at all. The editor alone (tools as outlines) must never show.
  await page.evaluate(() => {
    const w = window as unknown as { __bare: number; __frames: number };
    w.__bare = 0;
    w.__frames = 0;
    const tick = () => {
      w.__frames += 1;
      const busy = document.documentElement.hasAttribute('data-busy');
      const boot = document.getElementById('boot');
      const covered =
        boot !== null &&
        !boot.hasAttribute('hidden') &&
        Number(getComputedStyle(boot).opacity) >= 0.99;
      const editor = document.querySelector('canvas.viewport') !== null;
      const library = document.querySelector('.library') !== null;
      if (busy && editor && !library && !covered) w.__bare += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('.tile__face').first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __bare: number; __frames: number };
    return { bare: w.__bare, frames: w.__frames };
  });
  expect(seen.frames).toBeGreaterThan(5);
  expect(seen.bare).toBe(0);
});

test('D13: a drawn rectangle carries no H and V marks, and a length is turned by dragging it', async ({
  page,
}) => {
  await prefer(page, 'openView', 'top');
  await openApp(page);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await railButton(page, 'Rectangle').click();
  await railButton(page, 'Diagonal').click();
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  const lengths = page.getByRole('textbox', { name: /Length for sketch line/ });
  await expect(lengths).toHaveCount(2);
  // The sides are held horizontal and vertical without drawing H/V marks.
  await expect(page.locator('.constraint-mark')).toHaveCount(0);

  const first = lengths.first();
  const before = Number(await first.inputValue());
  const box = await first.boundingBox();
  if (box === null) throw new Error('no length field');
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await first.inputValue())).toBeGreaterThan(before + 1);
});

test('C3: a gizmo handle is let go of when its drag is done, and does not stay lit', async ({
  page,
}) => {
  const { doubleClickAt } = await import('../app.js');
  await openApp(page);
  await addBox(page);
  await doubleClickAt(page, { x: 20, y: 10, z: 15 });
  await expect(page.getByRole('toolbar', { name: 'Move and rotate' })).toBeVisible();
  const handle = page.getByRole('button', { name: 'Move X', exact: true });
  const box = await handle.boundingBox();
  if (box === null) throw new Error('no move handle');
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.up();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  // Move the pointer away too, so only a stuck pressed state could keep it lit.
  await page.mouse.move(box.x + 400, box.y + 300);
  await expect(handle).toHaveAttribute('aria-pressed', 'false');
});

test('E1, E3: the study bar keeps clear of the rail and the panel, and the study browser has no extra cross', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Simulation/ }).click();
  const bar = page.locator('.sim-bar');
  await expect(bar).toBeVisible();
  // No steps card: the rail marks what is missing and the panel describes it.
  await expect(page.locator('.sim-steps')).toHaveCount(0);
  const clear = async () => {
    const b = await bar.boundingBox();
    const inspector = await page.locator('.sim-inspector').boundingBox();
    const rail = await page.locator('.rail--left .rail__icons').first().boundingBox();
    if (b === null || inspector === null || rail === null) throw new Error('not on screen');
    expect(b.x).toBeGreaterThan(rail.x + rail.width);
    expect(b.x + b.width).toBeLessThan(inspector.x);
  };
  await clear();
  await railButton(page, 'Study').click();
  await expect(page.getByRole('complementary', { name: 'Study browser' })).toBeVisible();
  // The rail's Study button toggles it; there is no second close button in its header.
  await expect(page.getByRole('button', { name: 'Close study browser' })).toHaveCount(0);
  await page.waitForTimeout(400);
  await clear();
});

test('D4: the image panel says what Size and Crop change, which is only the handles', async ({
  page,
}) => {
  await openApp(page);
  await importFile(
    page,
    'one.png',
    'image/png',
    twoColourPng(200, 100, [200, 40, 40], [40, 40, 200]),
  );
  const panel = page.getByRole('complementary', { name: 'Image' });
  await expect(panel.getByText('Handles on the picture')).toBeVisible();
  await expect(panel.getByText('Drag the corners to resize the picture.')).toBeVisible();
  await panel.getByRole('radio', { name: 'Crop' }).check({ force: true });
  await expect(panel.getByText('The picture stays where it is.', { exact: false })).toBeVisible();
});

test('B4: looking straight from the front there is a grid, on the plane facing the view', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.locator('.viewcube__face[data-face="front"]').click();
  await page.waitForTimeout(1200);
  const rect = await canvasRect(page);
  // A pixel row above the model, clear of the rail and cube. Grid lines show as brightness steps;
  // a ground grid seen edge-on leaves it blank.
  const shot = await page.screenshot({
    clip: { x: rect.x + 260, y: rect.y + 90, width: rect.width * 0.5, height: 1 },
  });
  const steps = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    context.drawImage(image, 0, 0);
    const { data: px } = context.getImageData(0, 0, canvas.width, 1);
    let changes = 0;
    for (let x = 1; x < canvas.width; x++)
      if (Math.abs((px[x * 4] ?? 0) - (px[(x - 1) * 4] ?? 0)) > 5) changes += 1;
    return changes;
  }, shot.toString('base64'));
  expect(steps).toBeGreaterThan(8);
});

test('B7: the turntable keeps turning while the view is zoomed, and Stop ends it', async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 600_000 : 240_000);
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  const canvas = page.getByLabel('PBR presentation viewport');
  // The PBR renderer starts in software without a GPU, as in the other Visualize tests.
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 120_000 });
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('no viewport');
  const clip = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.2, width: 300, height: 300 };
  const differ = async (a: Buffer, b: Buffer) =>
    page.evaluate(
      async ([one, two]) => {
        const load = async (data: string) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('no 2d');
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const [x, y] = await Promise.all([load(one ?? ''), load(two ?? '')]);
        let count = 0;
        for (let i = 0; i < x.length; i += 4)
          if (Math.abs((x[i] ?? 0) - (y[i] ?? 0)) > 3) count += 1;
        return count;
      },
      [a.toString('base64'), b.toString('base64')],
    );

  await page.getByRole('button', { name: 'Turntable', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Turntable', exact: true })).toBeVisible();
  const first = await page.screenshot({ clip });
  await page.waitForTimeout(1500);
  const second = await page.screenshot({ clip });
  // Turning changes thousands of pixels; a still picture shows only film grain (about a hundred).
  expect(await differ(first, second)).toBeGreaterThan(2000);

  // Zooming with the wheel while turning changes the picture at once, and it keeps changing.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(800);
  const zoomed = await page.screenshot({ clip });
  await page.waitForTimeout(1200);
  const later = await page.screenshot({ clip });
  expect(await differ(second, zoomed)).toBeGreaterThan(2000);
  expect(await differ(zoomed, later)).toBeGreaterThan(2000);

  // Once stopped it eases to rest like the view after a drag, then holds still.
  await page.getByRole('button', { name: 'Stop Turntable', exact: true }).click();
  await expect
    .poll(
      async () => {
        const before = await page.screenshot({ clip });
        await page.waitForTimeout(700);
        return differ(before, await page.screenshot({ clip }));
      },
      { timeout: 20_000 },
    )
    .toBeLessThan(500);
});

test('B5: resizing the window leaves the picture whole in the same step, never an empty buffer', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.waitForTimeout(800);
  // Registered after the app's own observer, so it runs right after it in the same delivery,
  // before paint. An empty buffer at that point shows as a flash.
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.viewport');
    if (canvas === null) throw new Error('no viewport');
    const seen: number[] = [];
    (window as unknown as { __resizeSeen: number[] }).__resizeSeen = seen;
    new ResizeObserver(() => {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext('2d');
      if (context === null) return;
      context.drawImage(canvas, 0, 0);
      const { data } = context.getImageData(0, 0, copy.width, copy.height);
      let drawn = 0;
      for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) drawn += 1;
      seen.push(drawn / (copy.width * copy.height));
    }).observe(canvas);
  });
  const size = page.viewportSize();
  if (size === null) throw new Error('no viewport size');
  for (const width of [size.width - 120, size.width - 260, size.width - 60]) {
    await page.setViewportSize({ width, height: size.height });
    await page.waitForTimeout(150);
  }
  const seen = await page.evaluate(
    () => (window as unknown as { __resizeSeen: number[] }).__resizeSeen,
  );
  // The first entry is the observer's initial call, before any resize.
  expect(seen.length).toBeGreaterThan(1);
  for (const share of seen.slice(1)) expect(share).toBeGreaterThan(0.99);
});

test('D5: Visualize and Drawings have the quick settings at the foot of the picture, beside their panel and not under it', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  const goTo = async (name: RegExp) => {
    await page.getByRole('button', { name: /Workspace:/ }).click();
    await page.getByRole('menuitemradio', { name }).click();
  };
  const button = railButton(page, 'Quick settings');
  /** The button sits left of the panel, low in the stage, and does not overlap it. */
  const besidePanel = async (panel: string) => {
    // Polled: the workspace reports its panel width to the shell as it appears, so the panel
    // settles a moment later.
    await expect
      .poll(async () => {
        const [p, b] = [await page.locator(panel).boundingBox(), await button.boundingBox()];
        return p === null || b === null ? 0 : p.x - (b.x + b.width);
      })
      .toBeGreaterThan(0);
    const p = await page.locator(panel).boundingBox();
    if (p === null) throw new Error('no panel');
    const b = await button.boundingBox();
    if (b === null) throw new Error('no button');
    expect(b.y + b.height).toBeGreaterThan(p.y + p.height - 60);
  };
  await goTo(/^Visualize/);
  await besidePanel('.viz-inspector');
  await button.click();
  // A single section, so no tabs: Display, with only the settings shared by every workspace.
  await expect(page.getByRole('tablist', { name: 'Sections' })).toHaveCount(0);
  await expect(page.getByText('Theme', { exact: true })).toBeVisible();
  await expect(page.getByText('Shading', { exact: true })).toHaveCount(0);
  await goTo(/^Drawings/);
  await besidePanel('.dwg-inspector');
  await quickSettings(page, 'Display');
  await expect(page.getByRole('tablist', { name: 'Sections' }).getByRole('tab')).toHaveText([
    'Display',
    'Units & Grid',
  ]);
  await goTo(/^Modeling/);
  await quickSettings(page, 'View');
  await expect(page.getByRole('tablist', { name: 'Sections' }).getByRole('tab')).toHaveText([
    'View',
    'Display',
    'Units & Grid',
  ]);
});

test('D7: the side panels of Visualize and Drawings end at the same height, and the add button sits in the title row', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  const bottoms = async (left: string, right: string) => {
    const a = await page.locator(left).first().boundingBox();
    const b = await page.locator(right).first().boundingBox();
    if (a === null || b === null) throw new Error('a panel is not on show');
    return [a.y + a.height, b.y + b.height];
  };
  /** Opens Items in this workspace through its rail, unless already open. */
  const openItemsPanel = async (panel: string) => {
    // The drawer is shared between workspaces, so its button may close what the last one opened.
    // Retry until the panel is up.
    await expect(async () => {
      if (await page.locator(panel).first().isVisible()) return;
      await page
        .locator('.rail__icon:visible')
        .filter({ has: page.getByText('Items', { exact: true }) })
        .first()
        .click();
      await expect(page.locator(panel).first()).toBeVisible({ timeout: 1500 });
    }).toPass();
  };
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  await openItemsPanel('.workspace[data-workspace="visualize"] .items-panel');
  const viz = await bottoms(
    '.workspace[data-workspace="visualize"] .items-panel',
    '.viz-inspector',
  );
  expect(Math.abs((viz[0] ?? 0) - (viz[1] ?? 0))).toBeLessThan(2);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
  await openItemsPanel('.dwg-items');
  const dwg = await bottoms('.dwg-items', '.dwg-inspector');
  expect(Math.abs((dwg[0] ?? 0) - (dwg[1] ?? 0))).toBeLessThan(2);
  const title = await page.locator('.dwg-items h2').boundingBox();
  const add = await page.getByRole('button', { name: 'Add sheet from Items' }).boundingBox();
  if (title === null || add === null) throw new Error('no title row');
  expect(Math.abs(title.y + title.height / 2 - (add.y + add.height / 2))).toBeLessThan(6);
});

test('D5: the quick settings name their sections as tabs, keep the grid in one place and mark what holds everywhere', async ({
  page,
}) => {
  await openApp(page);
  const button = railButton(page, 'Quick settings');
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'true');
  const tabs = page.getByRole('tablist', { name: 'Sections' });
  await expect(tabs.getByRole('tab')).toHaveText(['View', 'Display', 'Units & Grid']);
  await tabs.getByRole('tab', { name: 'Display' }).click();
  await expect(tabs.getByRole('tab', { name: 'Display' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: /Look\s*Every workspace/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grid', exact: true })).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Units & Grid' }).click();
  await expect(page.getByLabel('Show grid')).toBeChecked();
  await expect(page.getByLabel('Snap to grid')).toBeVisible();
  await page.getByLabel('Show grid').uncheck();
  await expect(page.getByText('Grid on', { exact: true })).toHaveCount(0);
  // After closing and reopening, it returns to the last section viewed.
  await button.click();
  await expect(tabs).toHaveCount(0);
  await button.click();
  await expect(tabs.getByRole('tab', { name: 'Units & Grid' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('D12: a picked face is drawn in the selection colour chosen in Settings, and the interface uses it too', async ({
  page,
}) => {
  await prefer(page, 'selectionColour', '#ff375f');
  await openApp(page);
  await addBox(page);
  const top = { x: 20, y: 10, z: 15 };
  await pickAt(page, top);
  await page.waitForTimeout(300);
  const at = screenPointOf(await canvasRect(page), top);
  const shot = await page.screenshot({ clip: { x: at.x + 6, y: at.y + 6, width: 1, height: 1 } });
  const [r, g] = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) return [0, 0, 0];
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, shot.toString('base64'));
  // Pink: red well above green.
  expect(r ?? 0).toBeGreaterThan((g ?? 0) + 60);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--select').trim(),
    ),
  ).toBe('#ff375f');
});

test('D12: the outline along a seam is one colour, not striped with the black edge under it', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 20, y: 10, z: 15 });
  // The pointer stays over the side face, whose border is outlined; its seam with the top runs
  // along the box's top right edge.
  await pickAt(page, { x: 40, y: 10, z: 7 });
  await page.waitForTimeout(300);
  const rect = await canvasRect(page);
  const shot = await page.screenshot();
  const points = Array.from({ length: 15 }, (_, i) =>
    screenPointOf(rect, { x: 40, y: 3 + i, z: 15 }),
  );
  const dark = await page.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) return -1;
      context.drawImage(image, 0, 0);
      let count = 0;
      // Sample a few pixels around each point: the black edge is one pixel wide and the projection
      // is not pixel-exact.
      for (const p of points) {
        const { data: px } = context.getImageData(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5);
        for (let i = 0; i < px.length; i += 4)
          if ((px[i] ?? 0) + (px[i + 1] ?? 0) + (px[i + 2] ?? 0) < 200) count += 1;
      }
      return count;
    },
    { data: shot.toString('base64'), points },
  );
  expect(dark).toBe(0);
});

test('D3: a floating panel steps aside for the quick settings and comes back, lines up beside the rail, and resizes from a corner', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await railButton(page, 'Measure').click();
  const panel = page.getByRole('complementary', { name: 'Measurements' });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(300);
  const before = await panel.boundingBox();
  if (before === null) throw new Error('no panel');

  // Quick settings open where the panel stands: it moves out of the way, and back afterwards.
  await railButton(page, 'Quick settings').click();
  const dock = await page.locator('.view-panel-dock').boundingBox();
  if (dock === null) throw new Error('no quick settings');
  await expect
    .poll(async () => {
      const b = await panel.boundingBox();
      if (b === null) return true;
      return (
        b.x < dock.x + dock.width &&
        b.x + b.width > dock.x &&
        b.y < dock.y + dock.height &&
        b.y + b.height > dock.y
      );
    })
    .toBe(false);
  await railButton(page, 'Quick settings').click();
  await expect
    .poll(async () => Math.round((await panel.boundingBox())?.x ?? 0))
    .toBe(Math.round(before.x));

  // Dropped a little right of the left rail, it snaps to one gap from the rail's band.
  const grip = panel.getByRole('button', { name: 'Move Measure panel' });
  const g = await grip.boundingBox();
  const band = await page.locator('.rail--left .rail__icons').nth(1).boundingBox();
  if (g === null || band === null) throw new Error('no grip or rail');
  await page.mouse.move(g.x + 20, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(band.x + band.width + 8 + 12 + 20, band.y + 30, { steps: 10 });
  await page.mouse.up();
  const beside = await panel.boundingBox();
  expect(Math.round((beside?.x ?? 0) - (band.x + band.width))).toBe(8);

  // Dragging a corner resizes it.
  const corner = panel.locator('.inspection-panel__corner[data-corner="se"]');
  const c = await corner.boundingBox();
  if (c === null || beside === null) throw new Error('no corner');
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 6 });
  await page.mouse.up();
  const bigger = await panel.boundingBox();
  expect((bigger?.width ?? 0) - beside.width).toBeGreaterThan(60);

  // The cube stays above it.
  const layers = await page.evaluate(() => ({
    panel: Number(getComputedStyle(document.querySelector('.inspection-panel') as Element).zIndex),
    cube: Number(getComputedStyle(document.querySelector('.viewcube') as Element).zIndex),
  }));
  expect(layers.panel).toBeLessThan(layers.cube);
});

test('A13: a held modifier adds a body by double-click and takes it out again, and sheets are chosen together', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  const top = { x: 20, y: 10, z: 15 };
  const point = screenPointOf(await canvasRect(page), top);
  const gizmo = page.locator('.move-gizmo');
  await page.mouse.dblclick(point.x, point.y);
  await expect(gizmo).toBeVisible();
  // Shift + double-click on the selected body removes it; with nothing selected there is no gizmo.
  await page.keyboard.down('Shift');
  await page.mouse.dblclick(point.x, point.y);
  await page.keyboard.up('Shift');
  await expect(gizmo).toHaveCount(0);
  await page.keyboard.down('Shift');
  await page.mouse.dblclick(point.x, point.y);
  await page.keyboard.up('Shift');
  await expect(gizmo).toBeVisible();
  await page.keyboard.press('Escape');

  // Two sheets, the second chosen along with the first: inclusion is set on both.
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
  await page.getByRole('button', { name: 'Add sheet', exact: true }).click();
  const items = page.getByRole('complementary', { name: 'Drawing items' });
  await expect(items.locator('.dwg-items__sheets li')).toHaveCount(2);
  await items
    .locator('.dwg-items__sheets li')
    .first()
    .locator('button')
    .first()
    .click({
      modifiers: ['Shift'],
    });
  await expect(items.getByRole('status')).toHaveText(/2 sheets chosen/);
  await items.getByRole('button', { name: 'All bodies' }).click();
  await expect(items.locator('.dwg-items__sheets li small')).toHaveText([/1 bodies/, /1 bodies/]);
});

test('D11: a Shift-drag on the drawing desk draws a rectangle that chooses every sheet it touches', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Drawings/ }).click();
  await page.getByRole('button', { name: 'Add sheet', exact: true }).click();
  await page.getByRole('button', { name: 'Fit all' }).click();
  await page.waitForTimeout(400);
  const sheets = page.locator('.dwg__sheet');
  await expect(sheets).toHaveCount(2);
  const a = await sheets.nth(0).boundingBox();
  const b = await sheets.nth(1).boundingBox();
  if (a === null || b === null) throw new Error('no sheets');
  // From above-left of the first to below-right of the second, on the desk.
  const from = { x: Math.min(a.x, b.x) - 12, y: Math.min(a.y, b.y) - 12 };
  const to = {
    x: Math.max(a.x + a.width, b.x + b.width) + 12,
    y: Math.max(a.y + a.height, b.y + b.height) + 12,
  };
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(page.locator('.dwg__band')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('.dwg__sheet[data-chosen]')).toHaveCount(2);
  await expect(
    page.getByRole('complementary', { name: 'Drawing items' }).getByRole('status'),
  ).toHaveText(/2 sheets chosen/);
});

test('G3: a report can be started from the editor and from the start page, with the log', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.evaluate(() => console.warn('a test warning for the report'));
  await page.getByRole('button', { name: 'Report a problem' }).click();
  // A floating window over the app, not a modal dialog.
  const dialog = page.getByRole('region', { name: 'Report a problem' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Picture of the view, to draw on')).toBeVisible({
    timeout: 10_000,
  });
  await dialog.getByRole('radio', { name: 'Idea' }).check({ force: true });
  await dialog.getByRole('textbox', { name: 'In a few words' }).fill('The field stays empty');
  // The app stays usable underneath: its rail responds while the window is up.
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Take it again' }).click();
  await expect(dialog.getByLabel('Picture of the view, to draw on')).toBeVisible();
  // The GitHub issue contains the text, the workspace and the log.
  const popup = page.waitForEvent('popup').catch(() => null);
  await page.route('https://github.com/**', (route) => route.fulfill({ body: 'ok' }));
  await dialog.getByRole('button', { name: 'Open issue on GitHub' }).click();
  const opened = await popup;
  if (opened !== null) {
    const url = decodeURIComponent(opened.url().replace(/\+/g, ' '));
    expect(url).toContain('The field stays empty');
    expect(url).toContain('Modeling');
    expect(url).toContain('a test warning for the report');
    expect(url).toContain('labels=report,enhancement');
  }
  await expect(dialog).toHaveCount(0);

  // The start page has its own entry point, and Contribute is a tab there.
  await page.getByRole('button', { name: 'Projects' }).click();
  const nav = page.getByRole('navigation', { name: 'Library' });
  await nav.getByRole('button', { name: 'Contribute' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contribute' })).toBeVisible();
  await page.getByRole('button', { name: 'Report a problem' }).first().click();
  const onStartPage = page.getByRole('region', { name: 'Report a problem' });
  await expect(onStartPage).toBeVisible();
  // The draft survives closing and reopening the window.
  await onStartPage.getByRole('textbox', { name: 'In a few words' }).fill('Kept draft');
  await onStartPage.getByRole('button', { name: 'Close Report a problem' }).click();
  await expect(onStartPage).toHaveCount(0);
  await page.getByRole('button', { name: 'Report a problem' }).first().click();
  await expect(
    page
      .getByRole('region', { name: 'Report a problem' })
      .getByRole('textbox', { name: 'In a few words' }),
  ).toHaveValue('Kept draft');
});

test('D7: the Items panel in Visualize lists bodies only, with no history and no filter', async ({
  page,
}) => {
  await prefer(page, 'showHistory', true);
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: /^Visualize/ }).click();
  await page.locator('.rail--left button[title="Items"]:visible').first().click();
  const panel = page.locator('.workspace[data-workspace="visualize"] .items-panel');
  await expect(panel).toContainText('Body 1');
  await expect(panel).not.toContainText('Sketch 1');
  await expect(panel).not.toContainText('Extrude');
  await expect(panel.locator('.items-panel__filter')).toBeHidden();
});
