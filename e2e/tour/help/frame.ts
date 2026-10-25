/**
 * A docs picture: the app in a given state, cropped to the article's subject, with arrows computed
 * from the real target elements so they stay correct when the UI changes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { afterFrames } from '../../app.js';
import { expect } from '../../fixtures.js';

export const OUT = process.env.SHOTS_DIR ?? 'help-out';
mkdirSync(join(OUT, 'arrows'), { recursive: true });

export interface Pointed {
  /** What the arrows point at, one each. */
  points: readonly Locator[];
  /** What the picture must show, with margin around it. Defaults to the points. */
  area?: readonly (Locator | Box)[];
  /** The whole window. */
  whole?: boolean;
}

export type State = (page: Page) => Promise<Pointed>;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const WIDTH_MIN = 760;
const HEIGHT_MIN = 460;
const ROOM = 70;
/** Arrow length in page pixels. */
const LENGTH = 92;

async function boxOf(locator: Locator | Box): Promise<Box> {
  if (!('first' in locator)) return locator;
  // Re-measure until stable: a rail re-rendered for a mode replaces its buttons, and measuring
  // mid-swap fails with "not attached to the DOM".
  const found: { box: Box | null } = { box: null };
  await expect(async () => {
    // Scroll into view if possible, but measure regardless: on a loaded machine an element can take
    // longer to count as "stable" than its animation lasts.
    await locator
      .first()
      .scrollIntoViewIfNeeded({ timeout: 5_000 })
      .catch(() => undefined);
    found.box = await locator.first().boundingBox({ timeout: 5_000 });
    expect(found.box, 'a picture points at something that is not on the page').not.toBeNull();
  }).toPass({ timeout: 30_000 });
  if (found.box === null) throw new Error('a picture points at something that is not on the page');
  return found.box;
}

const union = (boxes: readonly Box[]): Box => {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

/** The crop: the area plus margin, at least a readable size, clamped to the page. */
function crop(area: Box, page: { width: number; height: number }): Box {
  let width = Math.max(WIDTH_MIN, area.width + ROOM * 2);
  let height = Math.max(HEIGHT_MIN, area.height + ROOM * 2);
  width = Math.min(width, page.width);
  height = Math.min(height, page.height);
  // Clamp the aspect ratio so pictures in a column share a shape.
  if (width / height > 1.9) height = Math.min(page.height, width / 1.9);
  if (width / height < 1.15) width = Math.min(page.width, height * 1.15);
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const x = Math.min(Math.max(0, cx - width / 2), page.width - width);
  const y = Math.min(Math.max(0, cy - height / 2), page.height - height);
  return { x, y, width, height };
}

/** An arrow from the middle of the picture's far side, ending at the target's edge. */
function arrowAt(target: Box, clip: Box) {
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  const cx = clip.x + clip.width / 2;
  // Comes from the side with more room, nearly level: a steep arrow would cross a row of controls.
  // From below when the target is near the top.
  const dx = tx > cx ? -1 : 1;
  const dy = ty - clip.y < 90 ? 0.4 : -0.4;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  // Where the line from the target centre towards the tail exits the target box, plus a gap.
  const reach = Math.min(
    ux === 0 ? Number.POSITIVE_INFINITY : target.width / 2 / Math.abs(ux),
    uy === 0 ? Number.POSITIVE_INFINITY : target.height / 2 / Math.abs(uy),
  );
  const head = { x: tx + ux * (reach + 6), y: ty + uy * (reach + 6) };
  const tail = { x: head.x + ux * LENGTH, y: head.y + uy * LENGTH };
  const norm = (p: { x: number; y: number }) => ({
    x: Math.min(1, Math.max(0, (p.x - clip.x) / clip.width)),
    y: Math.min(1, Math.max(0, (p.y - clip.y) / clip.height)),
  });
  const a = norm(tail);
  const b = norm(head);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** Waits until nothing moves, the pointer is away and notices are gone. */
export async function settle(page: Page): Promise<void> {
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await afterFrames(page);
  await afterFrames(page);
  await expect(page.locator('.toast'))
    .toHaveCount(0, { timeout: 12_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

export async function photograph(page: Page, name: string, pointed: Pointed): Promise<void> {
  await settle(page);
  const view = page.viewportSize() ?? { width: 1440, height: 900 };
  const targets = await Promise.all(pointed.points.map(boxOf));
  const area = pointed.whole
    ? { x: 0, y: 0, ...view }
    : union(await Promise.all([...(pointed.area ?? []), ...pointed.points].map(boxOf)));
  const clip = pointed.whole ? { x: 0, y: 0, ...view } : crop(area, view);
  await page.screenshot({ path: join(OUT, `${name}.png`), clip });
  writeFileSync(
    join(OUT, 'arrows', `${name}.json`),
    JSON.stringify(targets.map((target) => arrowAt(target, clip))),
  );
}
