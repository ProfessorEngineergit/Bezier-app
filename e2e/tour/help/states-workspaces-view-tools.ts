/** Pictures for Measure and Section View. */

import { addBox, canvasRect, railButton, screenPointOf } from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';

export const VIEW_TOOLS: Record<string, State> = {
  'measure-panel': async (page) => {
    await addBox(page);
    await railButton(page, 'Measure').click();
    const panel = page.getByRole('complementary', { name: 'Measurements' });
    await expect(panel).toContainText('Select two points');
    const rect = await canvasRect(page);
    // The centres of the top and front faces: both clear of the panel, so the line between them is
    // visible.
    for (const point of [
      { x: 20, y: 10, z: 15 },
      { x: 20, y: 0, z: 7.5 },
    ]) {
      const at = screenPointOf(rect, point);
      await page.mouse.click(at.x, at.y);
    }
    await panel.getByRole('switch').check();
    await expect(panel.locator('.measure-deltas dd')).toHaveCount(3);
    return { points: [panel.locator('.measure-result')], whole: true };
  },
  'section-view-panel': async (page) => {
    await addBox(page);
    await railButton(page, 'Section View').click();
    const panel = page.getByRole('complementary', { name: 'Section View' });
    await expect(panel.getByRole('textbox', { name: 'Z position' })).toHaveValue('7.5');
    return {
      points: [panel.getByRole('textbox', { name: 'Z position' })],
      area: [panel, page.locator('canvas.viewport')],
    };
  },
};
