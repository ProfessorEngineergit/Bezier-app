/** Pictures for the Learn articles. The sample lesson is the one the e2e specs use. */

import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';

const SAMPLE = fileURLToPath(
  new URL('../../fixtures-files/box-extrude.bezierlesson', import.meta.url),
);

async function openLearn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Learn', exact: true })
    .click();
  await expect(page.locator('.lessons-home')).toBeVisible();
}

/** Imports one file, which opens its player. */
async function importSample(page: Page): Promise<void> {
  await page.setInputFiles('.lessons-home input[type=file]', SAMPLE);
  await expect(page.locator('.lessons-player')).toBeVisible();
}

export const LEARN: Record<string, State> = {
  'learn-page': async (page) => {
    await openLearn(page);
    await importSample(page);
    await page.getByRole('button', { name: 'Lessons', exact: true }).click();
    const card = page.locator('.lessons-tile__face').first();
    await expect(card).toBeVisible();
    await page.mouse.move(2, 2);
    const level = page.getByRole('group', { name: 'Level' }).or(page.getByLabel('Level')).first();
    return {
      points: [level],
      area: [
        page.locator('.lessons-home header').first(),
        page.locator('.lessons-home__toolbar'),
        card,
      ],
    };
  },
  'learn-player-player': async (page) => {
    await openLearn(page);
    await importSample(page);
    const follow = page.getByRole('button', { name: 'Follow along' });
    await expect(follow).toBeVisible();
    return { points: [follow], area: [page.locator('.lessons-player')] };
  },
  'learn-follow-panel': async (page) => {
    await openLearn(page);
    await importSample(page);
    await page.getByRole('button', { name: 'Follow along' }).click();
    const panel = page.locator('.lessons-follow');
    await expect(panel.locator('video').first()).toBeVisible();
    // The last chapter, so the stage shows the lesson's final model, not the empty start.
    const next = panel.getByRole('button', { name: 'Next chapter' });
    await next.click();
    await next.click();
    await page.waitForTimeout(1500);
    return { points: [panel], whole: true };
  },
  'learn-record-sheet': async (page) => {
    await openLearn(page);
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    const sheet = page.getByRole('form', { name: 'Record a lesson' });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Title').fill('A first box');
    return {
      points: [sheet.getByRole('button', { name: 'Start recording' })],
      area: [sheet, page.locator('.lessons-empty'), page.locator('.lessons-home header').first()],
    };
  },
};
