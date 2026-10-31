/**
 * The small label beside the pointer that names what a drawn point would snap to. Its text must
 * stand out from its fill in both themes: the accent is light in the dark theme and dark in the
 * light one.
 */

import { afterFrames, canvasRect, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

/** WCAG contrast ratio of two `rgb(...)` colours, from 1 (the same) to 21. */
function contrast(a: string, b: string): number {
  const light = (colour: string) => {
    const [r = 0, g = 0, bl = 0] = (colour.match(/[\d.]+/g) ?? []).map(Number);
    const linear = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(bl);
  };
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

for (const scheme of ['dark', 'light'] as const) {
  test(`the snap label is readable in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await railButton(page, 'Sketch').click();
    const rect = await canvasRect(page);
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

    const start = { x: rect.x + rect.width * 0.4, y: rect.y + rect.height * 0.5 };
    await page.keyboard.press('l');
    await page.mouse.click(start.x, start.y);
    await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.5);
    await afterFrames(page);
    await page.keyboard.press('Escape');
    // Escape leaves the Line tool on or drops it, depending on whether the last click has been
    // solved yet; `l` switches it on or off, so it is pressed only when the tool is off.
    if ((await railButton(page, 'Line').getAttribute('aria-current')) !== 'true') {
      await page.keyboard.press('l');
    }

    // On the first end of the line, the next point would land on it.
    await page.mouse.move(start.x + 40, start.y + 30);
    await page.mouse.move(start.x, start.y, { steps: 4 });
    const hint = page.locator('.sketch-snap');
    await expect(hint).toBeVisible();
    const { text, fill } = await hint.evaluate((element) => ({
      text: getComputedStyle(element).color,
      fill: getComputedStyle(element).backgroundColor,
    }));
    expect(contrast(text, fill)).toBeGreaterThan(4.5);
  });
}
