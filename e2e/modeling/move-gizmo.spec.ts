import {
  addBox,
  canvasRect,
  doubleClickAt,
  openApp,
  openItems,
  pickAt,
  railButton,
} from '../app.js';
import { expect, test } from '../fixtures.js';

async function enterMove(page: import('@playwright/test').Page) {
  await openApp(page);
  await addBox(page);
  await doubleClickAt(page, { x: 20, y: 10, z: 15 });
  await expect(page.getByRole('toolbar', { name: 'Move and rotate' })).toBeVisible();
}

test('exact move, copy, rotation and undo use the real journal', async ({ page }) => {
  await enterMove(page);
  await expect(page.locator('.selection')).toHaveCount(0);
  await expect(page.locator('.extrude-gizmo')).toHaveCount(0);
  await expect(page.locator('.inspector')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('bezier-move-initial.png') });
  await page.getByRole('button', { name: 'Move X', exact: true }).click();
  const distance = page.getByRole('spinbutton', { name: 'Move distance' });
  await distance.fill('10');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page
    .getByRole('toolbar', { name: 'Move and rotate' })
    .getByRole('button', { name: 'Copy', exact: true })
    .click();
  await expect(
    page
      .getByRole('toolbar', { name: 'Move and rotate' })
      .getByRole('button', { name: 'Copy', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await distance.fill('50');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('bezier-move-copy.png') });
  await openItems(page);
  await expect(page.locator('.items-panel')).toContainText('Copy');
  await page
    .getByRole('toolbar', { name: 'Move and rotate' })
    .getByRole('button', { name: 'Copy', exact: true })
    .click();
  // SVG handles are keyboard-operable even where perspective makes their arc narrow.
  const turn = page.getByRole('button', { name: 'Rotate Z', exact: true });
  await turn.focus();
  await turn.press('Enter');
  const angle = page.getByRole('spinbutton', { name: 'Rotation angle' });
  await angle.fill('90');
  await angle.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await expect(page.locator('.items-panel')).toContainText('Rotate');
  // The applied angle stays shown at the arc and in the strip, with the plane drawn as a ring; the
  // field resets to 0 for the next turn, which adds to it (audit F-003).
  await expect(page.locator('.move-gizmo__angle')).toHaveText('+90°');
  await expect(page.getByRole('toolbar', { name: 'Move and rotate' })).toContainText('Last Z +90°');
  await expect(page.locator('.move-gizmo__ring')).toHaveCount(1);
  await expect(angle).toHaveValue('0');
  await page.screenshot({ path: test.info().outputPath('bezier-rotate-ring.png') });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.move-gizmo')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.items-panel')).not.toContainText('Rotate');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('.items-panel')).toContainText('Rotate');
});

test('drag cancel writes no feature and the gizmo has a transparent background', async ({
  page,
}) => {
  await enterMove(page);
  const axis = page.getByRole('button', { name: 'Move X', exact: true });
  const box = await axis.boundingBox();
  if (!box) throw new Error('Missing X arrow');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 - 30, { steps: 15 });
  await expect(page.getByRole('spinbutton', { name: 'Move distance' })).not.toHaveValue('0');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Move distance' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await openItems(page);
  await expect(page.locator('.items-panel')).not.toContainText('Move');
});

test('the blue centre repositions the rotation pivot without adding a model edit', async ({
  page,
}) => {
  await enterMove(page);
  const origin = page.getByRole('button', { name: 'Reposition move handle in selected plane' });
  const box = await origin.boundingBox();
  if (!box) throw new Error('Missing move pivot');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => ((await origin.boundingBox())?.x ?? box.x) - box.x)
    .toBeGreaterThan(40);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);
});

test('the line left behind a drag ends at the handle that was dragged, not at the pointer', async ({
  page,
}) => {
  await enterMove(page);
  const arrow = page.getByRole('button', { name: 'Move X', exact: true });
  const before = await arrow.boundingBox();
  if (before === null) throw new Error('the X arrow is not on the page');
  const grab = { x: before.x + before.width / 2, y: before.y + before.height / 2 };

  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  // Drag along the arrow and well off to the side: the arrow constrains motion to its own axis.
  await page.mouse.move(grab.x + 70, grab.y + 90, { steps: 8 });

  const line = page.locator('.move-gizmo__trail line');
  await expect(line).toBeVisible();
  const end = await line.evaluate((element) => ({
    x: Number(element.getAttribute('x2')),
    y: Number(element.getAttribute('y2')),
  }));
  // Read once the handle is drawn at its dragged position.
  await page.waitForTimeout(150);
  const after = await arrow.boundingBox();
  if (after === null) throw new Error('the X arrow went away');
  const arrowAt = { x: after.x + after.width / 2, y: after.y + after.height / 2 };
  // The line ends where the arrow went (the same distance from where it was grabbed)…
  expect(Math.hypot(end.x - (grab.x + (arrowAt.x - grab.x)), end.y - arrowAt.y)).toBeLessThan(6);
  // …which is not where the pointer is.
  expect(Math.hypot(end.x - (grab.x + 70), end.y - (grab.y + 90))).toBeGreaterThan(20);
  await page.mouse.up();
});

test('C2: a number typed with the pointer over a handle is given to that handle', async ({
  page,
}) => {
  await enterMove(page);
  const axis = page.getByRole('button', { name: 'Move X', exact: true });
  await axis.hover();
  await page.keyboard.type('12');
  const distance = page.getByRole('spinbutton', { name: 'Move distance' });
  await expect(distance).toHaveValue('12');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-panel')).toContainText('Move');
});

test('C2: slow turning rounds to whole degrees, fast turning to steps of fifteen', async ({
  page,
}) => {
  await enterMove(page);
  const turn = page.getByRole('button', { name: 'Rotate Z', exact: true });
  const input = page.getByRole('spinbutton', { name: 'Rotation angle' });
  const box = await turn.boundingBox();
  const centre = await page.evaluate(() => {
    const r = document.querySelector('.move-gizmo__origin')?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (box === null || centre === null) throw new Error('no rotation handle');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const radius = Math.hypot(start.x - centre.x, start.y - centre.y);
  const first = Math.atan2(start.y - centre.y, start.x - centre.x);
  const at = (degrees: number) => ({
    x: centre.x + radius * Math.cos(first + (degrees * Math.PI) / 180),
    y: centre.y + radius * Math.sin(first + (degrees * Math.PI) / 180),
  });
  /** Drags the handle round by `steps` moves of `each` degrees, `pause` ms apart. */
  const turnBy = async (steps: number, each: number, pause: number) => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      const p = at(i * each);
      await page.mouse.move(p.x, p.y);
      if (pause > 0) await page.waitForTimeout(pause);
    }
    const value = Number(await input.inputValue());
    await page.mouse.up();
    await expect(page.locator('html[data-busy]')).toHaveCount(0);
    return value;
  };
  const slow = await turnBy(12, 0.7, 60);
  expect(Math.abs(slow)).toBeGreaterThan(0);
  expect(Number.isInteger(slow)).toBe(true);
  const fast = await turnBy(3, 37, 0);
  expect(Math.abs(fast)).toBeGreaterThan(0);
  expect(Math.abs(fast) % 15).toBe(0);
});

test('C1: a body dragged along an arrow falls onto the grid and onto another body, and says so', async ({
  page,
}) => {
  await enterMove(page);
  const arrow = page.getByRole('button', { name: 'Move X', exact: true });
  const at = await arrow.boundingBox();
  if (at === null) throw new Error('the X arrow is not on the page');
  const grab = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const note = page.locator('.move-gizmo__snap');
  // Drag a few pixels at a time until a snap comes within reach.
  let seen = '';
  for (let i = 1; i <= 60 && seen === ''; i++) {
    await page.mouse.move(grab.x + i * 3, grab.y + i * 0.6);
    if ((await note.count()) > 0) seen = (await note.textContent()) ?? '';
  }
  await page.mouse.up();
  expect(seen).toMatch(/^X (on the grid|to (a side|the middle) of )/);
});

test('a sketch picked by its area in the view moves with the arrow, and one panel is under it', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.keyboard.press('r');
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await page.keyboard.press('Escape');
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  // Picked in the view, not the list: choosing Move dismisses Modeling's area offer, and the sketch
  // stays selected.
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await railButton(page, 'Transform').click();
  await railButton(page, 'Move/Rotate').click();
  await expect(page.getByRole('toolbar', { name: 'Move and rotate' })).toBeVisible();
  // No hint pill under the toolbar: the toolbar is the only panel there.
  await expect(page.locator('.move-gizmo__hint')).toHaveCount(0);
  const arrow = page.getByRole('button', { name: 'Move X', exact: true });
  const box = await arrow.boundingBox();
  if (box === null) throw new Error('Missing X arrow');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 10 });
  await expect(page.getByRole('spinbutton', { name: 'Move distance' })).not.toHaveValue('0');
  await page.mouse.up();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
});

test('a face or an edge picked by itself is moved by itself, and the body is not', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  // An edge of the top: one click, then Move.
  await pickAt(page, { x: 40, y: 10, z: 15 });
  await railButton(page, 'Transform').click();
  await railButton(page, 'Move/Rotate').click();
  await expect(page.getByRole('toolbar', { name: 'Move and rotate' })).toBeVisible();
  // Moved and rotated like a body, but never copied: a copy of an edge is not a part.
  await expect(page.getByRole('button', { name: 'Rotate Z', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Move Z', exact: true }).click();
  const distance = page.getByRole('spinbutton', { name: 'Move distance' });
  await distance.fill('6');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await openItems(page);
  await expect(page.locator('.items-panel')).toContainText('Move edge');
  // Still one body, and the move did not fail.
  await expect(page.locator('.items-row[data-status="failed"]')).toHaveCount(0);
});

test('an edge move that only runs along the edge is told why and not written down', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 40, y: 10, z: 15 });
  await railButton(page, 'Transform').click();
  await railButton(page, 'Move/Rotate').click();
  // The edge runs along Y, so moving along Y leaves its neighbours in place.
  await page.getByRole('button', { name: 'Move Y', exact: true }).click();
  const distance = page.getByRole('spinbutton', { name: 'Move distance' });
  await distance.fill('6');
  await distance.press('Enter');
  await expect(page.getByText(/changes nothing/)).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await openItems(page);
  await expect(page.locator('.items-panel')).not.toContainText('Move edge');
});

test('an edge turned by itself turns the two faces at it, and the body follows', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await pickAt(page, { x: 40, y: 10, z: 15 });
  await railButton(page, 'Transform').click();
  await railButton(page, 'Move/Rotate').click();
  const turn = page.getByRole('button', { name: 'Rotate Z', exact: true });
  await turn.focus();
  await turn.press('Enter');
  const angle = page.getByRole('spinbutton', { name: 'Rotation angle' });
  await angle.fill('10');
  await angle.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await openItems(page);
  await expect(page.locator('.items-panel')).toContainText('Turn edge');
  await expect(page.locator('.items-row[data-status="failed"]')).toHaveCount(0);
});

test('a corner picked by itself is lifted, the faces at it tilting to reach it', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);
  await page.keyboard.press('Escape');
  // The top corner nearest the default view.
  await pickAt(page, { x: 40, y: 0, z: 15 });
  await expect(page.locator('.selection li')).toHaveText([/^V\(/]);
  await railButton(page, 'Transform').click();
  await railButton(page, 'Move/Rotate').click();
  await page.getByRole('button', { name: 'Move Z', exact: true }).click();
  const distance = page.getByRole('spinbutton', { name: 'Move distance' });
  await distance.fill('4');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await openItems(page);
  await expect(page.locator('.items-panel')).toContainText('Move corner');
  await expect(page.locator('.items-row[data-status="failed"]')).toHaveCount(0);
});

test('a body follows the pointer as it is dragged, without a rebuild per step, and stays where it is let go', async ({
  page,
}) => {
  await enterMove(page);
  const axis = page.getByRole('button', { name: 'Move X', exact: true });
  const box = await axis.boundingBox();
  if (!box) throw new Error('Missing X arrow');
  const canvas = page.locator('canvas.viewport');
  const before = await canvas.screenshot();
  await page.evaluate(() => performance.clearMeasures());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 12 });
  // The picture moved, and the model was not rebuilt during the drag.
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  const rebuilds = await page.evaluate(
    () => performance.getEntriesByType('measure').filter((m) => m.name === 'bezier:rebuild').length,
  );
  expect(rebuilds).toBe(0);
  await page.screenshot({ path: test.info().outputPath('dragging.png') });
  await page.mouse.up();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await openItems(page);
  await expect(page.locator('.items-row', { hasText: 'Move' })).toBeVisible();
});

test('two fingers over a move handle orbit, as they do beside it', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('bezier.e2e', '1'));
  await enterMove(page);
  // WebView2 input on Windows for a precision trackpad: a pixel deltaY of 4 with the legacy
  // wheelDeltaY at -12. Re-dispatching it from the handle as a new event turned the legacy value
  // into +4, so the same gesture zoomed over the handle.
  const moved = await page.evaluate(async () => {
    type Pose = { position: number[]; target: number[] };
    const viewport = (
      window as unknown as {
        __bezierViewport: { cameraView(): Pose; showCameraView(pose: Pose): void };
      }
    ).__bezierViewport;
    const canvas = document.querySelector('canvas.viewport');
    const handle = document.querySelector(
      '.move-gizmo [aria-label="Reposition move handle in selected plane"]',
    );
    if (canvas === null || handle === null) throw new Error('No canvas or no move handle');
    const box = handle.getBoundingClientRect();
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const start = viewport.cameraView();
    const reach = (pose: Pose) =>
      Math.hypot(...pose.position.map((p, i) => p - (pose.target[i] ?? 0)));
    const out: { name: string; turned: number; reach: number }[] = [];
    for (const [name, target] of [
      ['canvas', canvas],
      ['handle', handle],
    ] as const) {
      viewport.showCameraView(start);
      await frame();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const before = viewport.cameraView();
      const event = new WheelEvent('wheel', {
        deltaY: 4,
        deltaMode: 0,
        bubbles: true,
        cancelable: true,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
      });
      Object.defineProperty(event, 'wheelDeltaY', { value: -12 });
      target.dispatchEvent(event);
      await frame();
      await frame();
      const after = viewport.cameraView();
      out.push({
        name,
        turned: Math.hypot(...after.position.map((p, i) => p - (before.position[i] ?? 0))),
        reach: reach(after) / reach(before),
      });
    }
    viewport.showCameraView(start);
    return out;
  });
  for (const { name, turned, reach } of moved) {
    expect(turned, `${name}: the camera moved`).toBeGreaterThan(0.1);
    expect(reach, `${name}: an orbit keeps the distance`).toBeCloseTo(1, 3);
  }
});

test('a sketch with a body on it is dragged as a picture, and the model is rebuilt once, at the end', async ({
  page,
}) => {
  // Rebuilding on every step would make the body lag behind the pointer.
  await openApp(page);
  await page.getByRole('button', { name: 'Top', exact: true }).dispatchEvent('click');
  await page.waitForTimeout(600);
  await railButton(page, 'Sketch').click();
  const rect = await canvasRect(page);
  await page.keyboard.press('r');
  await page.mouse.click(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await page.keyboard.press('Escape');
  await railButton(page, 'Finish Sketch').click();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  const distance = page.getByRole('spinbutton', { name: 'Extrude distance' });
  await distance.fill('15');
  await distance.press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await openItems(page);
  await page.locator('.items-row', { hasText: 'Sketch 1' }).click();
  await railButton(page, 'Transform').click();
  await railButton(page, 'Move/Rotate').click();
  const arrow = page.getByRole('button', { name: 'Move X', exact: true });
  const box = await arrow.boundingBox();
  if (box === null) throw new Error('Missing X arrow');
  const canvas = page.locator('canvas.viewport');
  const before = await canvas.screenshot();
  await page.evaluate(() => performance.clearMeasures());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 12 });
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  const rebuilds = await page.evaluate(
    () => performance.getEntriesByType('measure').filter((m) => m.name === 'bezier:rebuild').length,
  );
  expect(rebuilds).toBe(0);
  const dragged = await canvas.screenshot();
  await page.mouse.up();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  // Rebuilt at the drop position: the picture does not jump back.
  await page.waitForTimeout(400);
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  expect(dragged.length).toBeGreaterThan(0);
});
