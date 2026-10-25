/** Pictures for the Visualize articles. */

import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures.js';
import type { State } from './frame.js';
import { shownPart, toWorkspace } from './states-workspaces-world.js';

/** The part's tint: a blue that reads against both the light and the dark studio. */
const TINT = '#416fab';

/**
 * Visualize with the part in coloured plastic, once the renderer has started and the studio has
 * loaded. A grey part on a grey backdrop shows nothing.
 */
async function visualizing(page: Page, tint: string | null = TINT): Promise<void> {
  // The renderer is slow without a GPU: the spec's three minutes are not enough.
  test.setTimeout(900_000);
  await shownPart(page);
  await toWorkspace(page, 'Visualize');
  await expect(page.getByRole('complementary', { name: 'Look' })).toBeVisible();
  // Without a GPU the shaders compile on the CPU, which stalls the page.
  await expect(page.getByLabel('PBR presentation viewport')).toHaveAttribute('aria-busy', 'false', {
    timeout: 600_000,
  });
  if (tint !== null) await page.getByRole('button', { name: `Use ${tint}`, exact: true }).click();
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Look' });
const canvas = (page: Page) => page.getByLabel('PBR presentation viewport');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();

/** Clicks the render at a position given as fractions of its width and height. */
async function onRender(
  page: Page,
  fx: number,
  fy: number,
  button: 'left' | 'right' = 'left',
): Promise<void> {
  const box = await canvas(page).boundingBox();
  if (box === null) throw new Error('no render');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy, { button });
}

/** Rests the pointer on empty backdrop so no face or button is highlighted. */
async function rest(page: Page): Promise<void> {
  await page.mouse.move(200, 840);
}

/** Face positions in the initial render. */
const FRONT = [0.46, 0.56] as const;
const TOP = [0.4, 0.36] as const;

export const VISUALIZE: Record<string, State> = {
  'visualize-workspace': async (page) => {
    await visualizing(page);
    await rest(page);
    return {
      points: [panel(page), page.getByRole('toolbar', { name: 'Render' })],
      whole: true,
    };
  },
  'visualize-materials-library': async (page) => {
    await visualizing(page, null);
    // Fold the active material's controls so the library is shown.
    await panel(page).getByRole('button', { name: 'Done', exact: true }).click();
    const metal = panel(page).getByRole('button', { name: 'Brushed Aluminium', exact: true });
    await metal.scrollIntoViewIfNeeded();
    await metal.click();
    await expect(metal).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Loading maps…')).toHaveCount(0, { timeout: 300_000 });
    await metal.scrollIntoViewIfNeeded();
    await rest(page);
    return { points: [metal], whole: true };
  },
  'visualize-materials-adjust': async (page) => {
    await visualizing(page);
    const roughness = panel(page).getByRole('slider', { name: 'Roughness', exact: true });
    await expect(roughness).toBeVisible();
    await rest(page);
    return { points: [roughness, panel(page).getByRole('button', { name: 'Done' })], whole: true };
  },
  'visualize-faces-faces': async (page) => {
    await visualizing(page);
    await onRender(page, ...FRONT);
    await expect(page.getByText('1 face picked')).toBeVisible();
    await page.getByRole('button', { name: '#e5484d', exact: true }).click();
    // A picked face is tinted towards the accent; pick the next one so the red face shows as is.
    await onRender(page, ...TOP);
    await expect(page.getByText('1 face picked')).toBeVisible();
    const palette = page.getByRole('group', { name: 'Face colour' });
    await rest(page);
    return { points: [palette], whole: true };
  },
  'visualize-lights-controls': async (page) => {
    await visualizing(page, null);
    await page.getByLabel('Search materials').fill('Blue LED');
    await page.getByRole('button', { name: 'Blue LED', exact: true }).click();
    const strength = page.getByRole('slider', { name: 'Light Strength', exact: true });
    await expect(strength).toBeVisible();
    await rest(page);
    return { points: [strength, page.getByLabel('Light emission')], whole: true };
  },
  'visualize-environment-studios': async (page) => {
    await visualizing(page);
    await tab(page, 'Environment');
    await page.locator('[data-environment="technical-studio"]').click();
    const studios = page.locator('.viz-environments');
    await expect(studios).toHaveAttribute('aria-busy', 'false', { timeout: 120_000 });
    await expect(page.locator('[data-environment="technical-studio"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await rest(page);
    return { points: [studios], whole: true };
  },
  'visualize-camera-camera': async (page) => {
    await visualizing(page);
    await tab(page, 'Camera');
    const aperture = page.getByRole('button', { name: 'ƒ' + '2.8', exact: true });
    await aperture.click();
    // Right-click the near end of the front face to set focus, as the article describes.
    await onRender(page, 0.3, 0.6, 'right');
    const diagram = panel(page).locator('.viz-focus');
    await expect(diagram).toBeVisible();
    await rest(page);
    return { points: [aperture, diagram], whole: true };
  },
  'visualize-decals-decal': async (page) => {
    await visualizing(page);
    await panel(page).getByRole('button', { name: 'Done', exact: true }).click();
    await panel(page).getByLabel('Decal size').fill('10');
    // A small badge generated here and dropped on the front face, as a desktop file would be.
    const file = await page.evaluateHandle(async () => {
      const art = document.createElement('canvas');
      art.width = 256;
      art.height = 256;
      const pen = art.getContext('2d');
      if (pen === null) throw new Error('no canvas');
      pen.fillStyle = '#f5f5f7';
      pen.beginPath();
      pen.arc(128, 128, 120, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = '#e5484d';
      pen.beginPath();
      pen.arc(128, 128, 96, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = '#f5f5f7';
      pen.font = 'bold 120px sans-serif';
      pen.textAlign = 'center';
      pen.textBaseline = 'middle';
      pen.fillText('B', 128, 138);
      const blob = await new Promise<Blob | null>((done) => art.toBlob(done, 'image/png'));
      if (blob === null) throw new Error('no picture');
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'badge.png', { type: 'image/png' }));
      return transfer;
    });
    const box = await canvas(page).boundingBox();
    if (box === null) throw new Error('no render');
    await canvas(page).dispatchEvent('drop', {
      dataTransfer: file,
      clientX: box.x + box.width * FRONT[0],
      clientY: box.y + box.height * FRONT[1],
    });
    const clear = panel(page).getByRole('button', { name: 'Clear 1' });
    await expect(clear).toBeVisible();
    await rest(page);
    return {
      points: [page.locator('.viz-decal__row button').first(), clear],
      whole: true,
    };
  },
  'visualize-render-bar': async (page) => {
    await visualizing(page);
    const bar = page.getByRole('toolbar', { name: 'Render' });
    await rest(page);
    return { points: [bar], area: [bar] };
  },
};
