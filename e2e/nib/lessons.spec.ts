/**
 * Lessons (`@bezier/lessons`) in the editor: the Learn page, checkpoints opened as projects,
 * recording against the real canvas, and following a lesson. Lesson behaviour itself is tested in
 * `packages/lessons`; these cover the integration.
 */

import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { addBox, openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

const SAMPLE = fileURLToPath(
  new URL('../fixtures-files/box-extrude.bezierlesson', import.meta.url),
);

async function openLearn(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Learn', exact: true })
    .click();
  await expect(page.locator('.lessons-home')).toBeVisible();
}

async function importSample(page: Page) {
  await page.setInputFiles('.lessons-home input[type=file]', SAMPLE);
  await expect(page.locator('.lessons-player')).toBeVisible();
}

test('lesson cards play under a still pointer, loop, scrub and stop on exit', async ({ page }) => {
  await openLearn(page);
  await importSample(page);
  await page.getByRole('button', { name: 'Lessons', exact: true }).click();
  const card = page.locator('.lessons-tile__face').first();
  const poster = card.locator('img');
  await expect(poster).toBeVisible();
  await expect
    .poll(() => poster.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await card.hover();
  const preview = card.locator('video');
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
  await expect(preview).toHaveAttribute('data-ready', '');
  expect(await preview.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);

  // Count actual video loops rather than accepting a single frame as a working preview.
  await preview.evaluate((video: HTMLVideoElement) => {
    let previous = video.currentTime;
    video.dataset.loops = '0';
    video.addEventListener('timeupdate', () => {
      if (video.currentTime < previous - 0.1) {
        video.dataset.loops = String(Number(video.dataset.loops) + 1);
      }
      previous = video.currentTime;
    });
  });
  await expect
    .poll(async () => Number(await preview.getAttribute('data-loops')))
    .toBeGreaterThanOrEqual(2);

  const bounds = await card.boundingBox();
  if (!bounds) throw new Error('Missing lesson card');
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height / 2);
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await expect
    .poll(() =>
      preview.evaluate((video: HTMLVideoElement) =>
        Math.abs(video.currentTime / video.duration - 0.2),
      ),
    )
    .toBeLessThan(0.08);
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
  const media = await preview.elementHandle();
  if (!media) throw new Error('Missing preview video');
  await page.getByRole('heading', { name: 'Learn', exact: true }).hover();
  await expect(preview).toHaveCount(0);
  expect(await media.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);

  // Revisiting a cached lesson must still start the preview without another mouse movement.
  await card.hover();
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
  const second = await preview.elementHandle();
  if (!second) throw new Error('Missing revisited preview');
  // Opening by keyboard unmounts the card without a pointerleave masking the cleanup.
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.lessons-player')).toBeVisible();
  expect(await second.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
});

test('Follow Along is the only model action, and Home returns to Lessons', async ({ page }) => {
  await openLearn(page);
  await importSample(page);
  await expect(page.getByRole('button', { name: 'Open model here' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Follow along' }).click();
  await expect(page.locator('.lessons-follow')).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.lessons-follow')).toHaveCount(0);
  await expect(page.locator('.lessons-home')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: /^All Projects/ })
    .click();
  await expect(page.locator('.tile[data-lesson]')).toHaveCount(0);
});

test('a lesson is recorded against the real canvas, with a checkpoint per edit', async ({
  page,
}) => {
  // Recording needs MediaRecorder and canvas capture, which WebKit on Linux (and so the Linux
  // desktop app) lacks; the app reports that when asked. Chromium and WebKit on macOS run this.
  await openLearn(page);
  test.skip(
    await page.evaluate(() => typeof MediaRecorder === 'undefined'),
    'This browser cannot record the viewport.',
  );
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.getByLabel('Title').fill('A first box');
  await page.getByRole('button', { name: 'Start recording' }).click();

  await expect(page.locator('.lessons-recording')).toBeVisible();
  await expect(page.locator('.library')).toHaveCount(0);
  await addBox(page);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Finish' }).click();

  // Back on Learn in the edit view, with the start and the box as chapters.
  await expect(page.locator('.lessons-edit')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.library')).toBeVisible();
  const chapters = page.locator('.lessons-edit').getByText(/Start|Extrude|Sketch/);
  await expect(chapters.first()).toBeVisible();
});

test('following a lesson shows its checkpoints in the editor, and leaving ends it', async ({
  page,
}) => {
  await openLearn(page);
  await importSample(page);
  await page.getByRole('button', { name: 'Follow along' }).click();

  const panel = page.locator('.lessons-follow');
  await expect(panel).toBeVisible();
  await expect(page.locator('.library')).toHaveCount(0);
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await panel.getByRole('button', { name: 'Leave' }).click();
  await expect(panel).toHaveCount(0);
});

test('folding preserves the media element, resizing reaches the top bar, and exit pauses playback', async ({
  page,
}) => {
  await openLearn(page);
  await importSample(page);
  await page.getByRole('button', { name: 'Follow along' }).click();
  const panel = page.locator('.lessons-follow');
  const video = panel.locator('video').first();
  await expect(video).toBeVisible();
  const media = await video.elementHandle();
  if (!media) throw new Error('Lesson video is missing');
  await panel.getByRole('button', { name: 'Play', exact: true }).last().click();
  await expect.poll(() => media.evaluate((element) => element.paused)).toBe(false);
  await panel.getByRole('button', { name: 'Fold the lesson away' }).click();
  await expect(video).toHaveCount(1);
  await panel.getByRole('button', { name: 'Show the lesson' }).click();
  expect(await video.evaluate((element, original) => element === original, media)).toBe(true);
  await panel.getByRole('button', { name: 'Move the lesson (arrow keys)' }).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(panel).not.toHaveAttribute('data-settling', '');
  const grip = panel.getByRole('button', { name: 'Move the lesson (arrow keys)' });
  const box = await grip.boundingBox();
  if (!box) throw new Error('Lesson grip is missing');
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 8, -500, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await panel.boundingBox())?.y ?? 0)).toBe(64);
  await panel.getByRole('button', { name: 'Leave' }).click();
  await expect.poll(() => media.evaluate((element) => element.paused)).toBe(true);
});

test('all four corners resize about the opposite corner, and the video accepts scroll zoom', async ({
  page,
}) => {
  await openLearn(page);
  await importSample(page);
  await page.getByRole('button', { name: 'Follow along' }).click();
  const panel = page.locator('.lessons-follow');
  const grip = await panel
    .getByRole('button', { name: 'Move the lesson (arrow keys)' })
    .boundingBox();
  if (!grip) throw new Error('Missing lesson grip');
  await page.mouse.move(grip.x + 8, grip.y + 8);
  await page.mouse.down();
  await page.mouse.move(430, 245, { steps: 8 });
  await page.mouse.up();
  await expect(panel).not.toHaveAttribute('data-settling', '');
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
    const handle = panel.locator(`[data-corner="${corner}"]`);
    await expect(handle).toHaveCSS(
      'cursor',
      corner === 'top-left' || corner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize',
    );
    expect(await handle.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
    const before = await panel.boundingBox();
    const transport = await panel.locator('.lessons-controls').boundingBox();
    const hit = await handle.boundingBox();
    if (!before || !hit) throw new Error('Missing resize bounds');
    await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      hit.x + hit.width / 2 + (corner.endsWith('left') ? -24 : 24),
      hit.y + hit.height / 2 + (corner.startsWith('top') ? -14 : 14),
      { steps: 8 },
    );
    await page.mouse.up();
    const after = await panel.boundingBox();
    if (!after) throw new Error('Missing resized panel');
    expect(after.width).toBeGreaterThan(before.width + 12);
    // Only the video grows; the transport controls keep their size.
    const grown = await panel.locator('.lessons-controls').boundingBox();
    expect(grown?.height).toBeCloseTo(transport?.height ?? 0, 0);
    expect(after.height).toBeGreaterThan(before.height);
    for (const child of await panel
      .locator('.lessons-follow__head, .lessons-follow__tiles, .lessons-controls')
      .all()) {
      const bounds = await child.boundingBox();
      if (!bounds) throw new Error('Missing scaled lesson content');
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(after.x + after.width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(after.y + after.height + 1);
    }
    expect(
      Math.abs(
        after.x +
          (corner.endsWith('left') ? after.width : 0) -
          before.x -
          (corner.endsWith('left') ? before.width : 0),
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        after.y +
          (corner.startsWith('top') ? after.height : 0) -
          before.y -
          (corner.startsWith('top') ? before.height : 0),
      ),
    ).toBeLessThan(2);
  }
  const video = panel.locator('video').first();
  await video.hover();
  const before = (await panel.boundingBox())?.width ?? 0;
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await panel.boundingBox())?.width ?? 0).toBeGreaterThan(before);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await panel.boundingBox())?.width ?? 0).toBeLessThan(before + 2);
  await openItems(page);
  const sidebar = await page.locator('.items-panel').boundingBox();
  if (!sidebar) throw new Error('Missing Items panel');
  await expect
    .poll(async () => (await panel.boundingBox())?.x ?? 0)
    .toBeGreaterThanOrEqual(sidebar.x + sidebar.width + 11);
  await panel.getByRole('button', { name: 'Make the video larger' }).click();
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect
    .poll(async () => {
      const rect = await panel.boundingBox();
      return (rect?.y ?? 0) + (rect?.height ?? 0);
    })
    .toBeLessThanOrEqual(589);
  await page.screenshot({ path: test.info().outputPath('lesson-corners.png') });
});

test('a saved lesson project reopens its video without replacing the learner’s geometry', async ({
  page,
}) => {
  await openLearn(page);
  await importSample(page);
  await expect(page.getByRole('button', { name: 'Edit Lesson', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Follow along' }).click();
  await expect(page.locator('canvas.viewport')).toHaveAttribute('data-triangles', '0');
  await addBox(page);
  const count = await page.locator('canvas.viewport').getAttribute('data-triangles');
  await expect(page.getByLabel('The model follows the video')).not.toBeChecked();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: /^All Projects/ })
    .click();
  // A lesson's project is stored with the lessons and not listed among the projects.
  await expect(page.locator('.tile[data-lesson]')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Learn', exact: true })
    .click();
  const tile = page.getByRole('region', { name: 'Your lesson projects' }).locator('.tile');
  await expect(tile).toHaveCount(1);
  const shot = tile.locator('.tile__shot');
  await expect(shot).toBeVisible();
  await expect
    .poll(() => shot.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  // The watermark is baked into the image, so lifting a card cannot leave it behind.
  await expect(tile.locator('.tile__learn-watermark')).toHaveCount(0);
  const source = await shot.getAttribute('src');
  const bounds = await tile.locator('.tile__face').boundingBox();
  if (!bounds) throw new Error('Missing lesson project picture');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 35, bounds.y + bounds.height / 2 + 30, {
    steps: 6,
  });
  await expect(page.locator('.tile--carried .tile__shot')).toHaveAttribute('src', source ?? '');
  await page.mouse.up();
  await expect(page.locator('.tile--carried')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('learn-project-thumbnail.png') });
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Learn', exact: true })
    .click();
  await expect(shot).toBeVisible();
  const resumedSource = await shot.getAttribute('src');
  await tile.locator('.tile__face').click();
  const panel = page.locator('.lessons-follow');
  await expect(panel.locator('video').first()).toBeVisible();
  await expect(page.getByLabel('The model follows the video')).not.toBeChecked();
  await panel.getByRole('slider', { name: 'Lesson timeline' }).focus();
  await page.keyboard.press('End');
  await expect(page.locator('canvas.viewport')).toHaveAttribute('data-triangles', count ?? '');
  // Leaving through the PiP button must save a thumbnail too, even when the video began empty.
  await panel.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(shot).toBeVisible();
  await expect(shot).not.toHaveAttribute('src', resumedSource ?? '');
  const id = await tile.getAttribute('data-doc-id');
  if (!id) throw new Error('Missing lesson project');
  await page.evaluate(
    async ({ backendPath, project }) => {
      const {
        OpfsBackend,
        IndexedDbBackend,
      }: typeof import('../../packages/storage/src/index.js') = await import(backendPath);
      let backend: import('../../packages/storage/src/backend.js').StorageBackend;
      try {
        await navigator.storage.getDirectory();
        backend = new OpfsBackend();
      } catch {
        backend = new IndexedDbBackend();
      }
      await backend.remove(`docs/${project}/thumbnail.png`);
      await backend.remove(`docs/${project}/workspace-lesson-thumbnail.json`);
    },
    {
      backendPath: `/@fs${fileURLToPath(new URL('../../packages/storage/src/index.ts', import.meta.url))}`,
      project: id,
    },
  );
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Learn', exact: true })
    .click();
  await expect(shot).toBeVisible();
  await expect
    .poll(() => shot.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await tile.locator('.tile__face').click();
  await expect(page.locator('canvas.viewport')).toHaveAttribute('data-triangles', count ?? '');
});
