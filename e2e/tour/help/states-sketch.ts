import { addBox, canvasRect, pickAt, railButton } from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';
import { STATES_MORE } from './states-sketch-more.js';
import {
  at,
  drawPlate,
  finish,
  markAt,
  onCanvas,
  pixelAt,
  plate,
  polygon,
  rectangleAt,
  sketching,
  userView,
} from './world.js';

/** Each picture shows the editor as users see it (see `userView`). */
const asUser =
  (state: State): State =>
  async (page) => {
    await userView(page);
    return state(page);
  };

const STATES: Record<string, State> = {
  'sketch-drawn': async (page) => {
    await drawPlate(page);
    await page.mouse.move(300, 120);
    const lengths = page.getByRole('textbox', { name: /Length for sketch line/ });
    const diameter = page.getByRole('textbox', { name: /Diameter for sketch circle/ });
    await expect(diameter).toBeVisible();
    return {
      points: [lengths.first(), diameter],
      area: [await onCanvas(page, 0.2, 0.2, 0.8, 0.85)],
    };
  },
  'sketch-offer': async (page) => {
    await drawPlate(page);
    await finish(page);
    await at(page, 0.4, 0.55);
    const arrow = page.getByRole('button', { name: 'Drag to change extrude distance' });
    await expect(arrow).toBeVisible();
    return { points: [arrow], area: [await onCanvas(page, 0.2, 0.2, 0.8, 0.85)] };
  },
  'sketch-result': async (page) => {
    await plate(page);
    await page.mouse.move(300, 120);
    return { points: [], area: [await onCanvas(page, 0.2, 0.2, 0.8, 0.85)] };
  },
  'start-a-sketch-planes': async (page) => {
    await railButton(page, 'Sketch').click();
    const finishButton = railButton(page, 'Finish Sketch');
    await expect(finishButton).toBeVisible();
    await railButton(page, 'Line').hover();
    const floor = await markAt(page, 720, 505, 60, 30);
    return {
      points: [floor, finishButton],
      area: [railButton(page, 'Line'), finishButton, await onCanvas(page, 0.3, 0.3, 0.7, 0.8)],
    };
  },
  'start-a-sketch-face': async (page) => {
    await addBox(page);
    await railButton(page, 'Tools').click();
    await pickAt(page, { x: 20, y: 10, z: 15 });
    await railButton(page, 'Sketch').click();
    const finishButton = railButton(page, 'Finish Sketch');
    await expect(finishButton).toBeVisible();
    await railButton(page, 'Line').hover();
    return {
      points: [finishButton],
      area: [railButton(page, 'Line'), finishButton, await onCanvas(page, 0.2, 0.2, 0.8, 0.9)],
    };
  },
  'line-chain': async (page) => {
    await sketching(page);
    await polygon(page, [
      [0.42, 0.62],
      [0.58, 0.62],
      [0.5, 0.4],
    ]);
    await page.mouse.move(300, 120);
    const length = page.getByRole('textbox', { name: /Length for sketch line/ }).first();
    await expect(length).toBeVisible();
    return { points: [length], area: [await onCanvas(page, 0.3, 0.3, 0.7, 0.75)] };
  },
  'rectangle-variants': async (page) => {
    await sketching(page);
    await railButton(page, 'Rectangle').click();
    const center = railButton(page, 'Center');
    await expect(center).toBeVisible();
    return {
      points: [center, railButton(page, 'Diagonal')],
      area: [railButton(page, 'Rectangle'), center],
    };
  },
  'rectangle-typed': async (page) => {
    await sketching(page);
    await page.keyboard.press('r');
    await at(page, 0.4, 0.62);
    const to = await pixelAt(page, 0.62, 0.38);
    await page.mouse.move(to.x, to.y);
    await page.keyboard.type('60');
    await page.keyboard.press('Tab');
    await page.keyboard.type('40');
    const live = page.locator('.sketch-dimension[data-live]');
    await expect(live.first()).toBeVisible();
    return { points: [live.first()], area: [await onCanvas(page, 0.25, 0.25, 0.8, 0.75)] };
  },
  'circle-diameter': async (page) => {
    await sketching(page);
    await page.keyboard.press('c');
    await at(page, 0.5, 0.5);
    await at(page, 0.58, 0.5);
    await page.mouse.move(300, 120);
    const diameter = page.getByRole('textbox', { name: /Diameter for sketch circle/ });
    await expect(diameter).toBeVisible();
    return { points: [diameter], area: [await onCanvas(page, 0.3, 0.3, 0.7, 0.7)] };
  },
  'arc-arc': async (page) => {
    await sketching(page);
    await page.keyboard.press('l');
    await at(page, 0.43, 0.54);
    await at(page, 0.57, 0.54);
    await page.keyboard.press('Escape');
    await page.keyboard.press('a');
    await at(page, 0.57, 0.54);
    await at(page, 0.43, 0.54);
    const rect = await canvasRect(page);
    await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.42);
    const radius = page.locator('.sketch-dimension[data-live]');
    await expect(radius).toContainText('R');
    return { points: [radius], area: [await onCanvas(page, 0.3, 0.3, 0.7, 0.7)] };
  },
  'trim-before': async (page) => {
    await sketching(page);
    await polygon(page, [
      [0.42, 0.42],
      [0.42, 0.58],
      [0.58, 0.58],
      [0.58, 0.42],
    ]);
    await page.keyboard.press('l');
    await at(page, 0.34, 0.42);
    await at(page, 0.66, 0.42);
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    const trim = railButton(page, 'Trim');
    await expect(trim).toHaveAttribute('aria-current', 'true');
    const sticking = await pixelAt(page, 0.38, 0.42);
    const overshoot = await markAt(page, sticking.x, sticking.y, 40, 24);
    await page.mouse.move(300, 120);
    return {
      points: [overshoot, trim],
      area: [trim, railButton(page, 'Line'), await onCanvas(page, 0.28, 0.32, 0.72, 0.68)],
    };
  },
  'trim-after': async (page) => {
    await sketching(page);
    await polygon(page, [
      [0.42, 0.42],
      [0.42, 0.58],
      [0.58, 0.58],
      [0.58, 0.42],
    ]);
    await page.keyboard.press('l');
    await at(page, 0.34, 0.42);
    await at(page, 0.66, 0.42);
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    await at(page, 0.38, 0.42);
    await at(page, 0.62, 0.42);
    await page.keyboard.press('Escape');
    await page.mouse.move(300, 120);
    return { points: [], area: [await onCanvas(page, 0.28, 0.32, 0.72, 0.68)] };
  },
  'centerline-drawn': async (page) => {
    await sketching(page);
    await rectangleAt(page, [0.4, 0.4], [0.6, 0.6]);
    await railButton(page, 'Centerline').click();
    await at(page, 0.5, 0.34);
    await at(page, 0.5, 0.66);
    await page.keyboard.press('Escape');
    await page.mouse.move(300, 120);
    const line = await pixelAt(page, 0.5, 0.36);
    const mark = await markAt(page, line.x, line.y, 16, 40);
    return { points: [mark], area: [await onCanvas(page, 0.3, 0.3, 0.7, 0.7)] };
  },
  'construction-dashed': async (page) => {
    await sketching(page);
    await rectangleAt(page, [0.4, 0.4], [0.6, 0.6]);
    await at(page, 0.5, 0.4);
    const button = railButton(page, 'Construction');
    await button.click();
    return {
      points: [button],
      area: [button, railButton(page, 'Project'), await onCanvas(page, 0.3, 0.3, 0.7, 0.7)],
    };
  },
  'project-edges-projected': async (page) => {
    await addBox(page);
    await railButton(page, 'Tools').click();
    await pickAt(page, { x: 20, y: 10, z: 15 });
    await railButton(page, 'Sketch').click();
    const project = railButton(page, 'Project');
    await project.click();
    await page.mouse.move(300, 120);
    return {
      points: [project],
      area: [project, railButton(page, 'Finish Sketch'), await onCanvas(page, 0.2, 0.2, 0.8, 0.9)],
    };
  },
  'sketch-delete-picked': async (page) => {
    await sketching(page);
    await rectangleAt(page, [0.4, 0.4], [0.6, 0.6]);
    await at(page, 0.6, 0.5);
    const remove = railButton(page, 'Delete');
    await remove.hover();
    return {
      points: [remove],
      area: [remove, railButton(page, 'Line'), await onCanvas(page, 0.3, 0.3, 0.7, 0.7)],
    };
  },
  'dimensions-lengths': async (page) => {
    await sketching(page);
    await page.keyboard.press('r');
    await at(page, 0.4, 0.42);
    await at(page, 0.62, 0.6);
    await page.mouse.move(300, 120);
    const lengths = page.getByRole('textbox', { name: /Length for sketch line/ });
    await expect(lengths).toHaveCount(2);
    return { points: [lengths.first(), lengths.last()] };
  },
  'finish-sketch-button': async (page) => {
    await sketching(page);
    await rectangleAt(page, [0.4, 0.4], [0.6, 0.6]);
    const finishButton = railButton(page, 'Finish Sketch');
    await finishButton.hover();
    return {
      points: [finishButton],
      area: [finishButton, railButton(page, 'Delete'), await onCanvas(page, 0.3, 0.3, 0.7, 0.7)],
    };
  },
  ...STATES_MORE,
};

export const SKETCH: Record<string, State> = Object.fromEntries(
  Object.entries(STATES).map(([name, state]) => [name, asUser(state)]),
);
