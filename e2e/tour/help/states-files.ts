/**
 * Pictures for the file articles: undo, variables, import, the reference mesh, export and returning
 * to the projects.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { addBox, afterFrames, canvasRect, openItems, railButton } from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';
import { boxAtRest } from './world.js';

const BOX_STEP = readFileSync(
  fileURLToPath(new URL('../../fixtures-files/box-30x20x12.step', import.meta.url)),
);

/** A 70 × 50 × 30 mm box of twelve triangles as ASCII STL, standing in for a real scan. */
function scanStl(): string {
  const [x, y, z] = [70, 50, 30];
  const p = [
    [55, -15, 0],
    [55 + x, -15, 0],
    [55 + x, y - 15, 0],
    [55, y - 15, 0],
    [55, -15, z],
    [55 + x, -15, z],
    [55 + x, y - 15, z],
    [55, y - 15, z],
  ];
  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];
  const lines = ['solid scan'];
  for (const face of faces) {
    lines.push('facet normal 0 0 0', 'outer loop');
    for (const i of face) lines.push(`vertex ${(p[i] ?? []).join(' ')}`);
    lines.push('endloop', 'endfacet');
  }
  lines.push('endsolid scan');
  return lines.join('\n');
}

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
  'EOF',
  '',
].join('\n');

/** Imports a file by dropping it on the window, as the drop area suggests. */
async function importFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ([name, type, bytes]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
      return transfer;
    },
    [file.name, file.mimeType, [...file.buffer]] as const,
  );
  await page.dispatchEvent('canvas.viewport', 'drop', { dataTransfer });
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText(
    `Imported ${file.name}`,
  );
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

const meshFile = () => ({
  name: 'scan.stl',
  mimeType: 'model/stl',
  buffer: Buffer.from(scanStl()),
});

async function openVariables(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Shift+v');
  const panel = page.getByRole('complementary', { name: 'Variables' });
  await expect(panel).toBeVisible();
  return panel;
}

async function addVariable(panel: Locator, name: string, value: string): Promise<void> {
  await panel.getByLabel('New variable name').fill(name);
  await panel.getByLabel('New variable value').fill(value);
  await panel.getByRole('button', { name: 'Add' }).click();
  await expect(panel.getByLabel(`Value of ${name}`)).toHaveValue(value);
}

async function exportMenu(page: Page): Promise<Locator> {
  await page.locator('.titlebar__export').click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

export const FILES: Record<string, State> = {
  'undo-redo-items': async (page) => {
    await addBox(page);
    await openItems(page);
    await expect(page.locator('.items-row')).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.items-row')).toHaveCount(1);
    if (await railButton(page, 'Extrude').isVisible()) await railButton(page, 'Tools').click();
    await expect(railButton(page, 'Extrude')).toHaveCount(0);
    const row = page.locator('.items-row').first();
    return { points: [row], area: [row] };
  },

  'variables-panel': async (page) => {
    await addBox(page);
    await openItems(page);
    const panel = await openVariables(page);
    await addVariable(panel, 'wall', '4 mm');
    return { points: [panel.getByLabel('Value of wall')], area: [panel] };
  },

  'variables-field': async (page) => {
    await addBox(page);
    await openItems(page);
    const panel = await openVariables(page);
    await addVariable(panel, 'wall', '4 mm');
    await page.locator('.items-row', { hasText: 'Extrude' }).click();
    const field = page.locator('.inspector .property-panel__number').first();
    await field.fill('wall * 3');
    await field.press('Enter');
    const result = page.locator('.inspector .property-panel__value');
    await expect(result).toHaveText('= 12 mm');
    await expect(page.locator('html[data-busy]')).toHaveCount(0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    return { points: [field], area: [page.locator('.inspector'), result] };
  },

  'import-insert': async (page) => {
    await boxAtRest(page);
    await railButton(page, 'Insert').click();
    const file = railButton(page, 'File');
    await expect(file).toBeVisible();
    return { points: [file], area: [railButton(page, 'Insert'), file] };
  },

  'import-drop': async (page) => {
    await boxAtRest(page);
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['x'], 'bracket.step', { type: '' }));
      return transfer;
    });
    for (const type of ['dragenter', 'dragover']) {
      await page.dispatchEvent('canvas.viewport', type, {
        dataTransfer,
        clientX: 700,
        clientY: 450,
      });
    }
    const zone = page.locator('.dropzone');
    await expect(zone).toBeVisible();
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
      clientX: 700,
      clientY: 450,
    });
    return { points: [page.locator('.dropzone__label')], whole: true };
  },

  'import-items': async (page) => {
    await importFile(page, {
      name: 'bracket.step',
      mimeType: 'application/step',
      buffer: BOX_STEP,
    });
    await importFile(page, meshFile());
    await importFile(page, {
      name: 'plate.dxf',
      mimeType: 'image/vnd.dxf',
      buffer: Buffer.from(SQUARE_DXF),
    });
    await openItems(page);
    await expect(page.locator('.items-row')).toHaveText(['Import bracket', 'scan', 'plate']);
    return {
      points: [page.locator('.items-row', { hasText: 'scan' })],
      area: [page.locator('.items-panel')],
    };
  },

  'reference-mesh-view': async (page) => {
    await boxAtRest(page);
    await importFile(page, meshFile());
    await openItems(page);
    await expect(page.locator('.items-row', { hasText: 'scan' })).toBeVisible();
    // Zoom out far enough to see the scan beside the part.
    const rect = await canvasRect(page);
    await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.5);
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, 800);
      await afterFrames(page);
    }
    return {
      points: [page.locator('.items-row', { hasText: 'scan' })],
      whole: true,
    };
  },

  'reference-mesh-items': async (page) => {
    await boxAtRest(page);
    await importFile(page, meshFile());
    await openItems(page);
    const row = page.locator('.items-row', { hasText: 'scan' });
    await expect(row).toBeVisible();
    await row.hover();
    const eye = page.getByRole('button', { name: 'Hide scan' });
    return { points: [eye], area: [row, eye] };
  },

  'export-menu': async (page) => {
    await boxAtRest(page);
    const menu = await exportMenu(page);
    const step = menu.getByRole('menuitem', { name: /^STEP/ });
    return { points: [step], area: [menu, page.locator('.titlebar__export')] };
  },

  'export-selected': async (page) => {
    await boxAtRest(page);
    await openItems(page);
    await page.locator('.body-row', { hasText: 'Body 1' }).click();
    const menu = await exportMenu(page);
    const only = menu.getByText('Only the selected body');
    await expect(only).toBeVisible();
    return { points: [only], area: [menu, page.locator('.titlebar__export')] };
  },

  'back-to-projects-house': async (page) => {
    await boxAtRest(page);
    return {
      points: [page.getByRole('button', { name: 'Projects', exact: true })],
      area: [page.getByRole('button', { name: 'Projects', exact: true })],
    };
  },
};
