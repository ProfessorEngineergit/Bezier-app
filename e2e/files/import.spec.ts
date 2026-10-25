/**
 * File import. STEP files (written by the real kernel) arrive as bodies of their own; STL and OBJ,
 * being meshes, arrive as references to model against.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { commitExtrude, expectSaid, openApp, openItems, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

/** A 30 × 20 × 12 mm box, written by OCCT's STEP processor. */
const BOX_STEP = readFileSync(
  fileURLToPath(new URL('../fixtures-files/box-30x20x12.step', import.meta.url)),
);

test('a STEP file comes in as a body of its own', async ({ page }) => {
  await openApp(page);
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({
    name: 'bracket.step',
    mimeType: 'application/step',
    buffer: BOX_STEP,
  });
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Import bracket']);
  await expect(page.locator('.body-row')).toHaveText(['Body 1']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('a STEP file read once is kept, so opening it again does not parse it again', async ({
  page,
  browserName,
}) => {
  // Playwright's WebKit contexts have no OPFS (see document.spec.ts); the import itself is covered
  // in WebKit by the test above.
  test.skip(browserName === 'webkit', 'Playwright WebKit contexts have no OPFS');
  await openApp(page);
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({
    name: 'bracket.step',
    mimeType: 'application/step',
    buffer: BOX_STEP,
  });
  await openItems(page);
  await expect(page.locator('.body-row')).toHaveText(['Body 1']);
  // The kernel worker caches the shape in OPFS, along with the file's colours and part names
  // (none here).
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const shapes = await root.getDirectoryHandle('shapes', { create: true });
        const names: string[] = [];
        for await (const name of (shapes as unknown as { keys(): AsyncIterable<string> }).keys()) {
          names.push(name);
        }
        return names
          .map((name) =>
            name.includes('-colours-') ? 'colours' : name.includes('-names-') ? 'names' : 'shape',
          )
          .sort();
      }),
    )
    .toEqual(['colours', 'names', 'shape']);
});

async function importFile(page: import('@playwright/test').Page, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({ name, mimeType: 'model/stl', buffer: Buffer.from(text) });
}

const TRIANGLE_STL =
  'solid part\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 30 0 0\nvertex 0 30 0\nendloop\nendfacet\nendsolid part\n';

test('an STL mesh comes in as a reference, not as a body', async ({ page }) => {
  await openApp(page);
  await importFile(page, 'scan.stl', TRIANGLE_STL);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['scan']);
  await expect(page.locator('.body-row')).toHaveCount(0);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
  await expectSaid(page, 'As a reference mesh to model against.');
});

test('an OBJ mesh comes in too, and an empty mesh is refused with the reason', async ({ page }) => {
  await openApp(page);
  await importFile(page, 'quad.obj', 'v 0 0 0\nv 10 0 0\nv 10 10 0\nv 0 10 0\nf 1 2 3 4\n');
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['quad']);
  await importFile(page, 'empty.stl', 'solid part\nendsolid part\n');
  await expectSaid(page, 'This file holds no triangles.');
  await expect(page.locator('.items-row')).toHaveCount(1);
});

const SQUARE_DXF = [
  '0',
  'SECTION',
  '2',
  'ENTITIES',
  '0',
  'LWPOLYLINE',
  '8',
  '0',
  '90',
  '4',
  '70',
  '1',
  '10',
  '0',
  '20',
  '0',
  '10',
  '30',
  '20',
  '0',
  '10',
  '30',
  '20',
  '30',
  '10',
  '0',
  '20',
  '30',
  '0',
  'CIRCLE',
  '8',
  '0',
  '10',
  '15',
  '20',
  '15',
  '30',
  '0',
  '40',
  '5',
  '0',
  'ENDSEC',
  '0',
  'EOF',
  '',
].join('\n');

test('a DXF drawing comes in as a sketch that extrudes', async ({ page }) => {
  await openApp(page);
  await importFile(page, 'plate.dxf', SQUARE_DXF);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['plate']);
  if (!(await railButton(page, 'Extrude').isVisible())) await railButton(page, 'Tools').click();
  await railButton(page, 'Extrude').click();
  await commitExtrude(page);
  await expect(page.locator('.items-row')).toHaveText(['plate', 'Extrude']);
  await expect(page.locator('.items-row__problem')).toHaveCount(0);
});

test('an SVG drawing comes in, and a selected sketch goes out as DXF and SVG', async ({ page }) => {
  await openApp(page);
  await importFile(page, 'logo.svg', '<svg><rect x="0" y="0" width="40" height="20"/></svg>');
  await openItems(page);
  await page.locator('.items-row', { hasText: 'logo' }).click();
  for (const [label, needle] of [
    ['DXF', 'LINE'],
    ['SVG', '<line'],
  ] as const) {
    await page.locator('.titlebar__export').click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
    const done = await download;
    expect(done.suggestedFilename()).toBe(`logo.${label.toLowerCase()}`);
    expect(readFileSync(await done.path(), 'utf8')).toContain(needle);
  }
});

test('a file handed over by the desktop shell is imported like a picked one', async ({ page }) => {
  await openApp(page);
  // The Mac app's flow for a file opened from Finder: the shell passes the file name and a one-time
  // token, and the page reads the raw bytes through `read_import`. The shell side is stubbed here.
  await page.evaluate((text) => {
    const bytes = new TextEncoder().encode(text).buffer;
    const shell = window as Window & {
      __TAURI_INTERNALS__?: { invoke: (command: string, args: { token?: string }) => unknown };
      __bezierImport?: (name: string, token: string) => void;
    };
    shell.__TAURI_INTERNALS__ = {
      invoke: (command, args) =>
        command === 'read_import' && args.token === 'import-0'
          ? Promise.resolve(bytes)
          : Promise.reject(new Error(`unexpected ${command}`)),
    };
    shell.__bezierImport?.('bracket.dxf', 'import-0');
  }, SQUARE_DXF);
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['bracket']);
});

test('the Mac app leaves room for the window buttons in the editor too', async ({ page }) => {
  await openApp(page);
  // What `main.tsx` sets inside the Mac app.
  await page.evaluate(() => {
    document.documentElement.dataset.shell = 'desktop';
    document.documentElement.dataset.platform = 'mac';
  });
  const home = await page.getByRole('button', { name: 'Projects' }).boundingBox();
  expect(home?.x ?? 0).toBeGreaterThanOrEqual(90);
});

test('in full screen the Mac title bar starts at the left edge', async ({ page }) => {
  await openApp(page);
  // Set by the desktop shell in full screen: there are no window buttons, so no space is reserved.
  await page.evaluate(() => {
    document.documentElement.dataset.shell = 'desktop';
    document.documentElement.dataset.platform = 'mac';
    document.documentElement.toggleAttribute('data-fullscreen', true);
  });
  const home = await page.getByRole('button', { name: 'Projects' }).boundingBox();
  expect(home?.x ?? 100).toBeLessThan(20);
});

/** A drag carrying one file, as the browser builds it for a desktop drag. */
async function dragging(
  page: import('@playwright/test').Page,
  name: string,
  type: string,
  text: string,
) {
  return page.evaluateHandle(
    ([fileName, fileType, body]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([body], fileName, { type: fileType }));
      return transfer;
    },
    [name, type, text] as const,
  );
}

test('a STEP file dragged over the window is invited in, and follows the cursor', async ({
  page,
}) => {
  await openApp(page);
  const dataTransfer = await dragging(page, 'bracket.step', '', BOX_STEP.toString('utf8'));
  await page.dispatchEvent('canvas.viewport', 'dragenter', {
    dataTransfer,
    clientX: 500,
    clientY: 400,
  });
  await page.dispatchEvent('canvas.viewport', 'dragover', {
    dataTransfer,
    clientX: 500,
    clientY: 400,
  });
  const zone = page.locator('.dropzone');
  await expect(zone).toBeVisible();
  // Wait for the fade-in animation to finish (it starts slightly enlarged); a heavy frame can delay
  // it. The browser sends dragover every few frames; the next one places the area.
  await zone.evaluate((element) =>
    Promise.all(
      element
        .getAnimations()
        .filter((animation) => (animation as CSSAnimation).animationName === 'dropzone-in')
        .map((animation) => animation.finished),
    ),
  );
  await page.dispatchEvent('canvas.viewport', 'dragover', {
    dataTransfer,
    clientX: 500,
    clientY: 400,
  });
  const first = await page.locator('.dropzone__label').boundingBox();
  await page.dispatchEvent('canvas.viewport', 'dragover', {
    dataTransfer,
    clientX: 700,
    clientY: 450,
  });
  const moved = await page.locator('.dropzone__label').boundingBox();
  expect((moved?.x ?? 0) - (first?.x ?? 0)).toBeCloseTo(200, 0);

  // Drop: the file is imported and the drop zone goes away.
  await page.dispatchEvent('canvas.viewport', 'drop', { dataTransfer, clientX: 700, clientY: 450 });
  await expect(zone).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.body-row')).toHaveText(['Body 1']);
});

test('a file no import can read is not invited in', async ({ page }) => {
  await openApp(page);
  const dataTransfer = await dragging(page, 'manual.pdf', 'application/pdf', '%PDF-1.7');
  await page.dispatchEvent('canvas.viewport', 'dragenter', {
    dataTransfer,
    clientX: 500,
    clientY: 400,
  });
  await page.dispatchEvent('canvas.viewport', 'dragover', {
    dataTransfer,
    clientX: 500,
    clientY: 400,
  });
  await expect(page.locator('.dropzone')).toHaveCount(0);
});

test('a STEP file of loose flat faces comes in as sketches to build from (audit F-017)', async ({
  page,
}) => {
  await openApp(page);
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles({
    name: 'sections.step',
    mimeType: 'application/step',
    buffer: readFileSync(
      fileURLToPath(new URL('../fixtures-files/loft-profiles-surfaces.step', import.meta.url)),
    ),
  });
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['sections 1', 'sections 2']);
  await expect(page.getByText('holds no solid')).toHaveCount(0);
  // The two sections loft into a solid.
  await railButton(page, 'Tools').click();
  await railButton(page, 'Loft').click();
  await expect(page.locator('.items-row', { hasText: 'Loft' })).toBeVisible();
  await expect(page.locator('.body-row')).toHaveCount(1);
});
