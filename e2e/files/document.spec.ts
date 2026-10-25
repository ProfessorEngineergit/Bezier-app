/**
 * Document persistence and reference stability across edits. `session.test.ts` covers the same
 * against OCCT in Node; this covers the round trip through a browser, a worker, OPFS and a reload.
 */

import { addBox, openApp, openItems, opfsKeys, pickAt, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

/**
 * These read OPFS directly. Playwright's WebKit runs tests in ephemeral contexts without OPFS, so
 * the app uses IndexedDB there (see `storage-fallback.spec.ts`). Safari and the Mac app's webview
 * have OPFS.
 */
const OPFS_UNAVAILABLE =
  'Playwright WebKit contexts have no OPFS; the IndexedDB fallback is tested separately';

test('journals every edit before applying it', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', OPFS_UNAVAILABLE);
  // ADR 0009: the journal entry is on disk before the operation touches the document, so a crash
  // costs one edit, not a session.
  await openApp(page);
  await addBox(page);

  // The only project is the one just created.
  const keys = await opfsKeys(page);
  const id = keys.find((key) => key.endsWith('/journal.ndjson'))?.split('/')[1] ?? '';
  expect(keys).toContain(`docs/${id}/journal.ndjson`);
  expect(keys).toContain(`docs/${id}/snapshot.json`);

  const journal = await page.evaluate(async (id) => {
    const root = await navigator.storage.getDirectory();
    const docs = await root.getDirectoryHandle('docs');
    const project = await docs.getDirectoryHandle(id);
    const file = await (await project.getFileHandle('journal.ndjson')).getFile();
    return file.text();
  }, id);

  const entries = journal
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { seq: number; checksum: string; op: { op: string } });

  expect(entries).toHaveLength(2);
  expect(entries[0]?.seq).toBe(1);
  expect(entries[0]?.op.op).toBe('addFeature');
  // Each entry carries a checksum, so a damaged journal degrades to a partial load instead of
  // refusing to open.
  expect(entries[0]?.checksum).toMatch(/^[0-9a-f]{8}$/);
});

test('leaves no temporary files behind', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', OPFS_UNAVAILABLE);
  // Atomic writes go through uniquely named temporary files (a shared name deadlocked overlapping
  // writes), which is only safe if they are cleaned up.
  await openApp(page);
  await addBox(page);

  const keys = await opfsKeys(page);
  expect(keys.filter((key) => key.includes('.tmp'))).toEqual([]);
});

test('reopens the document after a reload', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  await page.reload();
  await openApp(page);
  await openItems(page);

  // Local-first: the work survives without any server involvement.
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});

test('keeps a fillet on the edge that was picked when an earlier feature changes', async ({
  page,
}) => {
  // A fillet stays on its edge after an earlier feature changes: persistent naming, end to end.
  await openApp(page);
  await addBox(page);

  // Pick the seam between the top face and the +X side, and round it.
  const edge = await pickAt(page, { x: 40, y: 10, z: 15 });
  expect(edge).toMatch(/^E\(/);

  await railButton(page, 'Chamfer/Fillet').click();
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(3);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  // Nothing may be marked broken.
  await expect(page.locator('.items-row__problem')).toHaveCount(0);

  // Change the extrusion the fillet sits on.
  await page.locator('.items-row', { hasText: 'Extrude' }).click();
  await page.locator('.property-panel__number').first().fill('25');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  // The fillet is still there, healthy, on the picked edge.
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude', 'Fillet']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('says which reference was lost rather than rounding something else', async ({ page }) => {
  // When a reference cannot survive, the tool names it instead of silently rounding another edge.
  await openApp(page);
  await addBox(page);

  const edge = await pickAt(page, { x: 40, y: 10, z: 15 });
  expect(edge).not.toBeNull();

  await railButton(page, 'Chamfer/Fillet').click();
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveCount(3);

  await page.locator('.items-row', { hasText: 'Fillet' }).click();

  // The reference is shown in words, with the canonical name as its title. It is stored as text;
  // rendering it as an object would show an empty row.
  await expect(page.locator('.property-panel__row--refs li')).toHaveAttribute(
    'title',
    edge as string,
  );
  await expect(page.locator('.property-panel__row--refs li')).toContainText('Edge of Extrude');

  // Delete it by emptying the edge list.
  await page.locator('.property-panel__row--refs button').first().click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);

  const fillet = page.locator('.items-row', { hasText: 'Fillet' });
  await expect(fillet).toHaveAttribute('data-state', /failed|dangling/);
  await expect(fillet.locator('.items-row__problem')).not.toBeEmpty();

  // The rest of the model survives: one bad feature must not cost the document (ADR 0009).
  await expect(page.locator('.items-row', { hasText: 'Extrude' })).toHaveAttribute(
    'data-state',
    'ok',
  );
});

test('projects left a moment ago open again without being read, the last one and the one before (kept projects)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', OPFS_UNAVAILABLE);
  await openApp(page);
  await addBox(page);
  // A second project with content; empty projects are not kept in the library.
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await addBox(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  // Loading a project is timed as `bezier:load` (trace.ts). Both projects were open in this
  // window, so neither needs to be read back.
  await page.evaluate(() => performance.clearMeasures());
  const tiles = page.locator('.tile__face');
  await expect(tiles).toHaveCount(2);
  for (const which of [0, 1]) {
    await tiles.nth(which).click();
    await expect(page.locator('canvas.viewport')).toBeVisible();
    await expect(page.locator('html[data-busy]')).toHaveCount(0);
    await openItems(page);
    await expect(page.locator('.body-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page.locator('.library[data-loaded]')).toBeVisible();
  }
  expect(
    await page.evaluate(() => performance.getEntriesByName('bezier:load').length),
    'a project was read back from storage',
  ).toBe(0);
});
