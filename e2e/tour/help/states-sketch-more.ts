import { openItems, quickSettings, railButton } from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';
import {
  at,
  finish,
  onCanvas,
  pullUp,
  rectangleAt,
  sketching,
  squareTop,
  twoLines,
} from './world.js';

/** Sketch pictures about what a finished drawing means. */
export const STATES_MORE: Record<string, State> = {
  'dimensions-grid': async (page) => {
    await sketching(page);
    await quickSettings(page, 'Units & Grid');
    const snap = page.getByLabel('Snap to grid');
    await snap.check();
    const step = page.getByLabel('Grid step');
    await expect(step).toBeVisible();
    return { points: [snap, step], area: [snap, step] };
  },
  'constraints-bar': async (page) => {
    const lines = await twoLines(page);
    await lines.first();
    await lines.second();
    const bar = page.getByRole('region', { name: 'Constraints' });
    const parallel = bar.getByRole('button', { name: 'Parallel' });
    await expect(parallel).toBeVisible();
    await page.mouse.move(300, 120);
    return { points: [parallel], area: [bar, await onCanvas(page, 0.3, 0.3, 0.7, 0.62)] };
  },
  'constraints-marks': async (page) => {
    const lines = await twoLines(page);
    await lines.first();
    await lines.second();
    const bar = page.getByRole('region', { name: 'Constraints' });
    await bar.getByRole('button', { name: 'Parallel' }).click();
    const mark = page.locator('.constraint-mark').first();
    await expect(mark).toBeVisible();
    await page.mouse.move(300, 120);
    return { points: [mark], area: [bar, await onCanvas(page, 0.3, 0.3, 0.7, 0.62)] };
  },
  'sketch-corner-corner': async (page) => {
    const lines = await twoLines(page);
    await lines.first();
    await lines.second();
    const bar = page.getByRole('region', { name: 'Constraints' });
    await bar.getByLabel('Corner size').fill('8');
    await page.mouse.move(300, 120);
    return {
      points: [bar.getByRole('button', { name: 'Fillet' })],
      area: [bar, await onCanvas(page, 0.3, 0.3, 0.7, 0.62)],
    };
  },
  'sketch-corner-done': async (page) => {
    const lines = await twoLines(page);
    await lines.first();
    await lines.second();
    const bar = page.getByRole('region', { name: 'Constraints' });
    await bar.getByLabel('Corner size').fill('8');
    await bar.getByRole('button', { name: 'Fillet' }).click();
    await page.mouse.move(300, 120);
    return { points: [], area: [await onCanvas(page, 0.3, 0.3, 0.7, 0.62)] };
  },
  'sketch-areas-areas': async (page) => {
    await sketching(page);
    await rectangleAt(page, [0.34, 0.34], [0.66, 0.66]);
    await rectangleAt(page, [0.44, 0.44], [0.56, 0.56]);
    await finish(page);
    await at(page, 0.36, 0.5);
    const arrow = page.getByRole('button', { name: 'Drag to change extrude distance' });
    await expect(arrow).toBeVisible();
    return { points: [arrow], area: [await onCanvas(page, 0.3, 0.3, 0.7, 0.7)] };
  },
  'reopen-sketch-editing': async (page) => {
    await squareTop(page);
    await railButton(page, 'Sketch').click();
    await rectangleAt(page, [0.4, 0.4], [0.6, 0.6]);
    await finish(page);
    await pullUp(page, [0.5, 0.5], '10');
    await openItems(page);
    const row = page.locator('.tree-row[data-kind="sketch"]').first();
    await row.dblclick();
    await expect(railButton(page, 'Finish Sketch')).toBeVisible();
    await page.mouse.move(900, 100);
    return {
      points: [row, railButton(page, 'Finish Sketch')],
      area: [
        page.locator('.items-panel'),
        railButton(page, 'Delete'),
        await onCanvas(page, 0.3, 0.3, 0.7, 0.7),
      ],
    };
  },
  'reopen-sketch-offset': async (page) => {
    await squareTop(page);
    await railButton(page, 'Sketch').click();
    await rectangleAt(page, [0.4, 0.4], [0.6, 0.6]);
    await finish(page);
    await pullUp(page, [0.5, 0.5], '10');
    await openItems(page);
    const row = page.locator('.tree-row[data-kind="sketch"]').first();
    await row.click();
    const offset = page.locator('.inspector').getByLabel('Offset');
    await expect(offset).toBeVisible();
    await page.mouse.move(900, 100);
    return {
      points: [offset, row],
      area: [page.locator('.inspector'), page.locator('.items-panel')],
    };
  },
};
