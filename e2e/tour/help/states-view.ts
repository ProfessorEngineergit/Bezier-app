import { addBox, canvasRect, quickSettings, railButton, screenPointOf } from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';
import { markAt, plate, userView } from './world.js';

const asUser =
  (state: State): State =>
  async (page) => {
    await userView(page);
    return state(page);
  };

const display = (page: Parameters<State>[0]) => railButton(page, 'Quick settings');
const shading = (page: Parameters<State>[0], name: string) =>
  page.getByRole('radio', { name, exact: true });

const STATES: Record<string, State> = {
  'display-modes-panel': async (page) => {
    await plate(page);
    await quickSettings(page, 'Display');
    const wireframe = shading(page, 'Wireframe');
    await wireframe.check();
    return {
      points: [wireframe],
      area: [display(page), shading(page, 'Shaded'), shading(page, 'X-Ray')],
    };
  },
  'display-modes-xray': async (page) => {
    await plate(page);
    await quickSettings(page, 'Display');
    const xray = shading(page, 'X-Ray');
    await xray.check();
    return {
      points: [xray],
      area: [display(page), shading(page, 'Shaded'), shading(page, 'Wireframe')],
    };
  },
  'square-view-before': async (page) => {
    await addBox(page);
    await railButton(page, 'Tools').click();
    const rect = await canvasRect(page);
    const front = screenPointOf(rect, { x: 20, y: 0, z: 7.5 });
    await page.mouse.move(front.x, front.y);
    const face = await markAt(page, front.x, front.y, 40, 40);
    return { points: [face], area: [await markAt(page, front.x, front.y, 900, 560)] };
  },
  'square-view-after': async (page) => {
    await addBox(page);
    await railButton(page, 'Tools').click();
    const rect = await canvasRect(page);
    const front = screenPointOf(rect, { x: 20, y: 0, z: 7.5 });
    await page.mouse.move(front.x, front.y);
    await page.keyboard.press('Space');
    await expect(page.getByRole('navigation', { name: 'Orientation' })).toBeVisible();
    await page.waitForTimeout(600);
    return {
      points: [],
      area: [await markAt(page, rect.x + rect.width / 2, rect.y + rect.height / 2, 900, 560)],
    };
  },
  'standard-views-cube': async (page) => {
    await addBox(page);
    await railButton(page, 'Tools').click();
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    const spin = page.getByRole('button', { name: 'Rotate left' });
    await expect(spin).toBeVisible();
    return {
      points: [page.getByRole('navigation', { name: 'Orientation' }), spin],
      area: [page.getByRole('navigation', { name: 'Orientation' })],
    };
  },
  'standard-views-panel': async (page) => {
    await addBox(page);
    await railButton(page, 'Tools').click();
    await quickSettings(page, 'View');
    const front = page.getByRole('button', { name: 'Front', exact: true }).last();
    await expect(front).toBeVisible();
    return {
      points: [front],
      area: [page.getByRole('button', { name: 'Zoom to fit' }), front],
    };
  },
};

export const VIEW: Record<string, State> = Object.fromEntries(
  Object.entries(STATES).map(([name, state]) => [name, asUser(state)]),
);
