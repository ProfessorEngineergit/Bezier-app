/**
 * Guards against web-page tells: selectable labels, a hand cursor on buttons, the browser's own
 * context menu. These regress silently (a stray `cursor: pointer` in one component), so they are
 * pinned here.
 */

import { openApp, quickSettings, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

test('the title bar and stage keep their measured proportions', async ({ page }) => {
  await openApp(page);

  const geometry = await page.locator('.workspace').evaluate((workspace) => {
    const titlebar = workspace.querySelector('.titlebar');
    const stage = workspace.querySelector('.stage');
    const rail = workspace.querySelector('.rail');
    if (titlebar === null || stage === null || rail === null) return null;
    return {
      titlebar: titlebar.getBoundingClientRect().height,
      stageTop: stage.getBoundingClientRect().top,
      railTop: rail.getBoundingClientRect().top,
    };
  });

  // The reference is a 2× Retina capture: its 104 px bar is 52 logical px. The rail sits `--edge`
  // (8 px) below the bar, the same inset as from every other edge.
  expect(geometry).toEqual({ titlebar: 52, stageTop: 52, railTop: 60 });
});

/** The computed `user-select`; WebKit reports only the prefixed property. */
const userSelect = (locator: import('@playwright/test').Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element) as CSSStyleDeclaration & { webkitUserSelect?: string };
    return style.userSelect || style.webkitUserSelect || '';
  });

test('the project name becomes selectable only while it is being renamed', async ({ page }) => {
  await openApp(page);

  const name = page.locator('.titlebar__name');
  await expect.poll(() => userSelect(name)).toBe('none');
  await expect(page.locator('.titlebar__nameInput')).toHaveCount(0);

  await name.click();
  const input = page.locator('.titlebar__nameInput');
  await expect(input).toBeFocused();
  await expect.poll(() => userSelect(input)).toBe('text');
});

test('the start page uses the same hard 52 pixel window bar', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Projects' }).click();

  const geometry = await page.locator('.library').evaluate((library) => {
    const bar = library.querySelector('.library__bar');
    const body = library.querySelector('.library__body');
    const identity = library.querySelector('.library-sidebar__identity');
    if (bar === null || body === null || identity === null) return null;
    const identityRect = identity.getBoundingClientRect();
    return {
      barHeight: bar.getBoundingClientRect().height,
      bodyTop: body.getBoundingClientRect().top,
      identityCenter: identityRect.top + identityRect.height / 2,
    };
  });

  // A hard 52 px bar, the body starting right under it, the identity centred on it.
  expect(geometry).toEqual({ barHeight: 52, bodyTop: 52, identityCenter: 26 });
  await expect(page.locator('.notification-panel')).toHaveCount(0);
});

test('a label cannot be selected the way page text can', async ({ page }) => {
  await openApp(page);
  const label = page.locator('.rail__labelName').first();

  const selected = await label.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const text = selection?.toString() ?? '';
    selection?.removeAllRanges();
    return text;
  });

  expect(selected).toBe('');
});

test('buttons wear the arrow, not the web hand', async ({ page }) => {
  await openApp(page);
  await expect(railButton(page, 'Items')).toHaveCSS('cursor', 'default');
});

test('the browser context menu never opens', async ({ page }) => {
  await openApp(page);
  const prevented = await page
    .locator('.rail__labelName')
    .first()
    .evaluate((node) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      return node.dispatchEvent(event) === false;
    });
  expect(prevented).toBe(true);
});

test('a text field still selects and still shows a caret', async ({ page }) => {
  await openApp(page);
  await quickSettings(page, 'Units & Grid');
  // Enabling grid snapping reveals a number field, where a caret is expected.
  await page.getByText('Snap to grid').click();
  const field = page.locator('.popover input[type="number"]').first();
  await expect(field).toBeVisible();
  await expect(field).toHaveCSS('cursor', 'text');
});
