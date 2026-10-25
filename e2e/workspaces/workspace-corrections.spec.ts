import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { addBox, doubleClickAt, openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

async function mode(page: Page, name: string) {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
}

test('four artboards occupy a shared desk and the compact toolbar never overlaps Items', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await mode(page, 'Drawings');
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Add sheet', exact: true }).click();
  await expect(page.locator('.dwg__sheet')).toHaveCount(4);
  const bounds = await Promise.all(
    (await page.locator('.dwg__sheet').all()).map((el) => el.boundingBox()),
  );
  const [a, b, c, d] = bounds;
  if (!a || !b || !c || !d) throw new Error('Missing drawing plates');
  expect(a.x).toBeCloseTo(c.x, 1);
  expect(a.y).toBeCloseTo(b.y, 1);
  expect(b.x).toBeCloseTo(d.x, 1);
  expect(c.y).toBeCloseTo(d.y, 1);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.y).toBeGreaterThan(a.y + a.height);
  await expect(page.locator('.dwg-overview [data-sheet-preview]')).toHaveCount(4);
  await page.getByRole('button', { name: /^Sheet 1 A3/ }).click();
  const after = await page.locator('.dwg__sheet').first().boundingBox();
  expect(after).toEqual(a);
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    const toolbar = await page.getByRole('toolbar', { name: 'Drawing tools' }).boundingBox();
    const items = await page
      .getByRole('navigation', { name: 'Drawing items controls' })
      .boundingBox();
    const overview = await page
      .getByRole('complementary', { name: 'Sheet overview' })
      .boundingBox();
    if (!toolbar || !items || !overview) throw new Error('Missing top controls');
    expect(toolbar.y).toBeCloseTo(items.y, 0);
    expect(toolbar.y).toBeCloseTo(overview.y, 0);
    expect(toolbar.x).toBeGreaterThanOrEqual(items.x + items.width);
    expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(overview.x);
    const buttons = ['Dimension', 'Section', 'Detail', 'Add sheet'];
    const ys = await Promise.all(
      buttons.map(
        async (name) => (await page.getByRole('button', { name, exact: true }).boundingBox())?.y,
      ),
    );
    expect(new Set(ys).size).toBe(1);
    expect(
      await page
        .locator('.dwg-toolbar__group')
        .last()
        .evaluate((el) => getComputedStyle(el).borderLeftWidth),
    ).toBe('0px');
  }
  await page.screenshot({ path: test.info().outputPath('shared-drawing-desk.png') });
});

test('material selection retains its scroll position and each solid keeps its own finish after reopening', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    const prefs = JSON.parse(localStorage.getItem('bezier.preferences') ?? '{}');
    (prefs.values ?? prefs).showHistory = false;
    localStorage.setItem('bezier.preferences', JSON.stringify(prefs));
  });
  await openApp(page);
  await addBox(page);
  await doubleClickAt(page, { x: 20, y: 10, z: 15 });
  await page.getByRole('button', { name: 'Move X', exact: true }).click();
  await page
    .getByRole('toolbar', { name: 'Move and rotate' })
    .getByRole('button', { name: 'Copy', exact: true })
    .click();
  await page.getByRole('spinbutton', { name: 'Move distance' }).fill('55');
  await page.getByRole('spinbutton', { name: 'Move distance' }).press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await openItems(page);
  const bodies = page.locator('.tree-row[data-kind="body"] .tree-row__main');
  await expect(bodies).toHaveCount(2);
  await mode(page, 'Visualize');
  await expect(page.getByLabel('PBR presentation viewport')).toHaveAttribute('aria-busy', 'false', {
    timeout: 120_000,
  });
  await bodies.first().click();
  await expect(page.locator('.viz-assignment')).toContainText('Body 1');
  const wood = page.getByRole('button', { name: 'American Walnut', exact: true });
  await wood.scrollIntoViewIfNeeded();
  const pane = page.locator('.viz-pane').first();
  const before = await pane.evaluate((el) => el.scrollTop);
  await wood.click();
  await expect(page.getByText('Loading maps…', { exact: true })).toHaveCount(0);
  expect(await pane.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
  await bodies.nth(1).click();
  await expect(page.locator('.viz-assignment')).toContainText('Body 2');
  await page.getByLabel('Search materials').fill('Clear Glass');
  await page.getByRole('button', { name: 'Clear Glass', exact: true }).click();
  await expect(page.locator('.viz-used')).toContainText('Clear Glass');
  await bodies.first().click();
  await expect(page.locator('.viz-used')).toContainText('American Walnut');
  await bodies.nth(1).click({ modifiers: ['Shift'] });
  await page.getByLabel('Search materials').fill('American Walnut');
  await page.getByRole('button', { name: 'American Walnut', exact: true }).click();
  await bodies.nth(1).click();
  await expect(page.locator('.viz-used')).toContainText('American Walnut');
  await page.getByLabel('Search materials').fill('Clear Glass');
  await page.getByRole('button', { name: 'Clear Glass', exact: true }).click();
  await expect(page.locator('.viz-used')).toContainText('Clear Glass');
  await page.getByRole('tab', { name: 'Environment', exact: true }).click();
  await page.getByRole('button', { name: 'Technical Studio', exact: true }).click();
  await expect(page.locator('.viz-environments')).toHaveAttribute('aria-busy', 'false', {
    timeout: 120_000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  const file = test.info().outputPath('wood-and-clear-glass.png');
  await (await download).saveAs(file);
  const pixels = (await readFile(file)).toString('base64');
  const colouredFloor = await page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No pixel reader');
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let coloured = 0;
    // The far foreground is empty studio, not the walnut or glass object.
    for (let y = Math.floor(image.height * 0.9); y < image.height; y++)
      for (let x = 0; x < image.width * 0.65; x++) {
        const i = (y * image.width + x) * 4;
        if (
          Math.max(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0) -
            Math.min(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0) >
          25
        )
          coloured++;
      }
    return coloured;
  }, pixels);
  expect(colouredFloor).toBe(0);
  await page.reload();
  await openApp(page);
  await mode(page, 'Visualize');
  await expect(page.getByLabel('PBR presentation viewport')).toHaveAttribute('aria-busy', 'false', {
    timeout: 120_000,
  });
  await openItems(page);
  await bodies.first().click();
  await expect(page.locator('.viz-used')).toContainText('American Walnut');
  await bodies.nth(1).click();
  await expect(page.locator('.viz-used')).toContainText('Clear Glass');
  await page.screenshot({ path: test.info().outputPath('body-material-assignment.png') });
});

test('the optional top-bar graph measures actual timing and rolls through three metrics', async ({
  page,
}) => {
  await openApp(page);
  await expect(page.locator('.performance-graph')).toHaveCount(0);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  const option = page.getByRole('checkbox', { name: 'Show performance graph', exact: true });
  await option.check();
  await page.reload();
  await openApp(page);
  const button = page.getByRole('button', { name: /^Performance:/ });
  await expect(button).toContainText('Frame time');
  await expect.poll(() => page.locator('.performance-graph__trace').getAttribute('d')).not.toBe('');
  await page.evaluate(() => {
    const value = document.querySelector('.performance-graph [data-measured-value]');
    if (!value) throw new Error('Missing performance value');
    const samples: number[] = [];
    value.setAttribute('data-observed-max', '0');
    const observer = new MutationObserver(() => {
      samples.push(Number(value.getAttribute('data-measured-value')));
      value.setAttribute('data-observed-max', String(Math.max(...samples)));
    });
    observer.observe(value, { attributes: true, attributeFilter: ['data-measured-value'] });
    window.setTimeout(() => observer.disconnect(), 2000);
    const end = performance.now() + 100;
    while (performance.now() < end) {
      /* A real blocked browser frame, not mocked telemetry. */
    }
  });
  await expect
    .poll(() =>
      page.locator('.performance-graph [data-observed-max]').getAttribute('data-observed-max'),
    )
    .not.toBe('0');
  await expect
    .poll(async () =>
      Number(
        await page
          .locator('.performance-graph [data-observed-max]')
          .getAttribute('data-observed-max'),
      ),
    )
    .toBeGreaterThan(60);
  const bounds = await button.boundingBox();
  await button.hover();
  await page.mouse.wheel(0, 80);
  await expect(button).toHaveAttribute('aria-label', /Frame cadence/);
  await expect(page.locator('.performance-graph__in')).toHaveCSS(
    'animation-name',
    'performance-roll-in',
  );
  await expect(page.locator('.performance-graph__in')).toHaveCount(0);
  await page.mouse.wheel(0, 80);
  await expect(button).toHaveAttribute('aria-label', /Main-thread delay/);
  await expect(page.locator('.performance-graph__in')).toHaveCount(0);
  await button.press('ArrowUp');
  await expect(button).toHaveAttribute('aria-label', /Frame cadence/);
  expect(await button.boundingBox()).toEqual(bounds);
  await page.screenshot({ path: test.info().outputPath('performance-graph.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button.click();
  await expect(page.locator('.performance-graph__in')).toHaveCount(0);
});
