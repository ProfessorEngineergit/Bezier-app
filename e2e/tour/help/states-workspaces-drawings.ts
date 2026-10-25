/** Pictures for the Drawings articles. */

import type { Page } from '@playwright/test';
import { railButton } from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';
import { shownPart, toWorkspace } from './states-workspaces-world.js';

const sheetPanel = (page: Page) => page.getByRole('complementary', { name: 'Sheet', exact: true });

async function drawings(page: Page): Promise<void> {
  await shownPart(page);
  await toWorkspace(page, 'Drawings');
  await expect(page.getByRole('button', { name: 'Export Sheet', exact: true })).toBeEnabled();
  await expect(page.locator('.drawing-paper polyline').first()).toBeAttached();
  // Automatic scale is chosen once the views arrive, and choosing it clears dimensions, so wait for
  // it to settle before dimensioning.
  const status = page.locator('.dwg__status');
  let last = '';
  await expect
    .poll(async () => {
      const now = (await status.textContent()) ?? '';
      const steady = now === last;
      last = now;
      return steady;
    })
    .toBe(true);
}

/** Rests the pointer on the empty desk so no button is highlighted. */
async function rest(page: Page): Promise<void> {
  await page.mouse.move(1000, 885);
}

interface Point {
  x: number;
  y: number;
}

/** The corners of a view's outline in page coordinates, from its visible lines. */
async function corners(page: Page, view: string) {
  const ends = await page
    .locator(`[data-view="${view}"] polyline:not([stroke-dasharray])`)
    .evaluateAll((lines) =>
      lines.flatMap((line) => {
        const matrix = (line as SVGPolylineElement).ownerSVGElement?.getScreenCTM();
        if (!matrix) return [];
        const numbers = (line.getAttribute('points') ?? '').split(/\s+/).map(Number);
        return [0, numbers.length - 2].map((i) => {
          const p = new DOMPoint(numbers[i] ?? 0, numbers[i + 1] ?? 0).matrixTransform(matrix);
          return { x: p.x, y: p.y };
        });
      }),
    );
  if (ends.length === 0) throw new Error(`no lines in the ${view} view`);
  const minX = Math.min(...ends.map((p) => p.x));
  const maxX = Math.max(...ends.map((p) => p.x));
  const onSide = (x: number) => ends.filter((p) => Math.abs(p.x - x) < 2);
  const top = (list: Point[]) => list.reduce((a, b) => (b.y < a.y ? b : a));
  const bottom = (list: Point[]) => list.reduce((a, b) => (b.y > a.y ? b : a));
  return {
    topLeft: top(onSide(minX)),
    bottomLeft: bottom(onSide(minX)),
    bottomRight: bottom(onSide(maxX)),
  };
}

/** One dimension between two points of a view, of the kind selected in the bottom bar. */
async function dimension(
  page: Page,
  kind: 'Aligned' | 'Horizontal' | 'Vertical',
  from: Point,
  to: Point,
  count: number,
): Promise<void> {
  await page.getByLabel('Dimension type').selectOption({ label: kind });
  await page.mouse.click(from.x, from.y);
  await page.mouse.click(to.x, to.y);
  await expect(page.locator('.dwg-dimension')).toHaveCount(count);
}

export const DRAWINGS: Record<string, State> = {
  'drawings-workspace': async (page) => {
    await drawings(page);
    await rest(page);
    return {
      points: [
        page.getByRole('toolbar', { name: 'Drawing tools' }),
        sheetPanel(page),
        railButton(page, 'Items'),
      ],
      whole: true,
    };
  },
  'drawings-sheets-items': async (page) => {
    await drawings(page);
    await page.getByRole('button', { name: 'Add sheet', exact: true }).click();
    const items = page.getByRole('complementary', { name: 'Drawing items', exact: true });
    await expect(items).toBeVisible();
    await page.getByRole('button', { name: /^Sheet 1 A3/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Body 1', exact: true })).toBeChecked();
    await rest(page);
    return {
      points: [
        items.locator('.dwg-items__sheets'),
        page.getByRole('checkbox', { name: 'Body 1', exact: true }),
      ],
      whole: true,
    };
  },
  'drawings-views-inspector': async (page) => {
    await drawings(page);
    await page.getByRole('button', { name: 'Section', exact: true }).click();
    const inspector = sheetPanel(page);
    const section = inspector.getByRole('switch', { name: 'Section A–A' });
    await expect(section).toBeChecked();
    await page.getByRole('button', { name: 'Detail', exact: true }).click();
    await expect(inspector.getByRole('switch', { name: /^Detail B/ })).toBeChecked();
    await expect(page.locator('[data-view="section"] polyline').first()).toBeAttached();
    await rest(page);
    return { points: [section], whole: true };
  },
  'drawings-dimensions-tool': async (page) => {
    await drawings(page);
    await page.getByRole('button', { name: 'Dimension', exact: true }).click();
    const front = await corners(page, 'front');
    await page.getByLabel('Dimension type').selectOption({ label: 'Horizontal' });
    await page.mouse.click(front.bottomLeft.x, front.bottomLeft.y);
    const hint = page.getByRole('status').filter({ hasText: 'Choose another endpoint' });
    await expect(hint).toBeVisible();
    await rest(page);
    return {
      points: [page.getByLabel('Dimension type'), page.locator('circle[r="1.3"]')],
      whole: true,
    };
  },
  'drawings-dimensions-made': async (page) => {
    await drawings(page);
    await page.getByRole('button', { name: 'Dimension', exact: true }).click();
    const front = await corners(page, 'front');
    await dimension(page, 'Horizontal', front.bottomLeft, front.bottomRight, 1);
    await dimension(page, 'Vertical', front.bottomLeft, front.topLeft, 2);
    const top = await corners(page, 'top');
    await dimension(page, 'Vertical', top.bottomLeft, top.topLeft, 3);
    await page.getByRole('button', { name: 'Dimension', exact: true }).click();
    await expect(page.getByLabel('Dimension type')).toHaveCount(0);
    await rest(page);
    const dimensions = page.locator('.dwg-dimension');
    return {
      points: [dimensions.first()],
      area: [
        page.locator('[data-view="front"]'),
        page.locator('[data-view="top"]'),
        dimensions.first(),
        dimensions.last(),
      ],
    };
  },
  'drawings-dimensions-frame': async (page) => {
    await drawings(page);
    const inspector = sheetPanel(page);
    await inspector.getByRole('button', { name: 'Position' }).click();
    await inspector.getByRole('button', { name: 'Add', exact: true }).click();
    await inspector.getByRole('button', { name: 'Flatness' }).click();
    await inspector.getByRole('button', { name: 'Add', exact: true }).click();
    const list = inspector.locator('.dwg-frames li');
    await expect(list).toHaveCount(2);
    await rest(page);
    return {
      points: [list.first(), page.locator('.drawing-paper rect[height="7"]').first()],
      whole: true,
    };
  },
  'drawings-title-block-block': async (page) => {
    await drawings(page);
    const inspector = sheetPanel(page);
    await inspector.getByLabel('Title', { exact: true }).fill('Bracket');
    await inspector.getByLabel('Revision', { exact: true }).fill('B');
    await inspector.getByLabel('Drawn by', { exact: true }).fill('A. Becker');
    await inspector.getByLabel('Company', { exact: true }).fill('Northgate Works');
    const title = page.getByRole('button', { name: 'Edit TITLE', exact: true });
    await expect(title).toHaveText('Bracket');
    await rest(page);
    return { points: [title, inspector.getByLabel('Title', { exact: true })], whole: true };
  },
  'drawings-title-block-branding': async (page) => {
    await drawings(page);
    const inspector = sheetPanel(page);
    await inspector.locator('summary', { hasText: 'Branding' }).click();
    await inspector.getByLabel('Watermark', { exact: true }).fill('PROTOTYPE');
    const logo =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1f2830" d="M12 2 21 7v10l-9 5-9-5V7z"/><path fill="#ffffff" d="M12 7 17 10v4l-5 3-5-3v-4z"/></svg>';
    await page.locator('input[type="file"][accept*="svg"]').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(logo),
    });
    const placed = page.locator('.drawing-paper svg[aria-hidden="true"]');
    await expect(placed).toBeAttached();
    await rest(page);
    return {
      points: [inspector.getByLabel('Watermark', { exact: true }), placed],
      whole: true,
    };
  },
  'drawings-export-menu': async (page) => {
    await drawings(page);
    await page.getByRole('button', { name: 'Export Sheet', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Export' });
    await expect(menu).toBeVisible();
    // Wait for the menu's fade-in to finish.
    await expect
      .poll(() => menu.evaluate((el) => el.getAnimations({ subtree: true }).length))
      .toBe(0);
    await rest(page);
    return { points: [menu], whole: true };
  },
};
