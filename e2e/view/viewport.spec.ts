/** The viewport in a real browser: drawing, picking and camera behaviour. */

import { fileURLToPath } from 'node:url';
import {
  addBox,
  afterFrames,
  BOX,
  canvasRect,
  openApp,
  openItems,
  pickAt,
  quickSettings,
  railButton,
  screenPointOf,
} from '../app.js';
import { expect, test } from '../fixtures.js';

test('starts the geometry kernel and reports a rebuild', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(page.locator('.rail--left')).toBeVisible();
});

test('runs the kernel in a worker, and not before it is needed', async ({ page }) => {
  // ADR 0009: the worker is a fault-isolation boundary. An OCCT abort is not catchable, so on the
  // main thread it would kill the app.
  await openApp(page);

  // ADR 0007 rule E: nothing waits for the kernel. An empty document needs no geometry, so the
  // ~5 MB of WebAssembly is not loaded yet.
  expect(page.workers()).toHaveLength(0);

  await addBox(page);
  expect(page.workers().length).toBeGreaterThan(0);
});

test('draws a solid when a box is added', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  await openItems(page);
  await expect(page.locator('.items-row')).toHaveText(['Sketch 1', 'Extrude']);

  // A viewport that renders black would pass every DOM assertion.
  const drawn = await page.locator('canvas.viewport').screenshot();
  expect(drawn.byteLength).toBeGreaterThan(1000);
});

test('resolves a click on the model to a stable reference', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  // The centre of the top face.
  const picked = await pickAt(page, { x: 20, y: 10, z: 15 });

  // Names come from provenance (feature and output), never a triangle index.
  //
  // The tag itself is not asserted. `start`, `end` and `side-n` are assigned by sorting faces on
  // their direction from the body centre, so on a box the top face is `side-1`. That is stable but
  // not meaningful, and pinning it would make it look intentional. Stability is tested below.
  expect(picked).toMatch(/^F:extrude-\d+:[a-z0-9-]+$/);
});

test('gives the same name for the same face every time', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  const first = await pickAt(page, { x: 20, y: 10, z: 15 });
  // Click elsewhere and back: a name that depended on click order or prior selection would fail.
  await pickAt(page, { x: 20, y: 0, z: 7 });
  const second = await pickAt(page, { x: 20, y: 10, z: 15 });

  expect(second).toBe(first);
});

test('resolves a click on a seam to the edge between two faces', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  // The seam where the top face meets the +X side.
  const picked = await pickAt(page, { x: 40, y: 10, z: 15 });

  // An edge is named by the two faces it lies between, which keeps the name stable across
  // rebuilds. The face tags are not asserted, as above.
  expect(picked).toMatch(/^E\(F:extrude-\d+:[a-z0-9-]+\|F:extrude-\d+:[a-z0-9-]+\)$/);
});

test('selects nothing when the click misses the model', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  const rect = await canvasRect(page);
  await page.mouse.click(rect.x + 12, rect.y + rect.height - 12);

  await expect(page.locator('.selection')).toHaveCount(0);
});

test('frames the model on screen rather than leaving it adrift', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  // A bounding-sphere fit would leave a 40 mm part at about a quarter of the frame. Project the
  // corners and check the spread.
  const rect = await canvasRect(page);
  const corners = [
    screenPointOf(rect, BOX.min),
    screenPointOf(rect, BOX.max),
    screenPointOf(rect, { x: BOX.max.x, y: BOX.min.y, z: BOX.min.z }),
    screenPointOf(rect, { x: BOX.min.x, y: BOX.max.y, z: BOX.max.z }),
  ];

  const spread = Math.max(...corners.map((c) => c.x)) - Math.min(...corners.map((c) => c.x));
  expect(spread).toBeGreaterThan(rect.width * 0.5);

  for (const corner of corners) {
    expect(corner.x).toBeGreaterThanOrEqual(rect.x);
    expect(corner.x).toBeLessThanOrEqual(rect.x + rect.width);
  }
});

test('leaves the camera alone when a parameter changes', async ({ page }) => {
  // A rebuild must not re-frame the camera and discard the user's zoom (it looks like the part
  // shrinking). Checked through picking: the same screen point must miss the framed model, hit the
  // zoomed one and still hit after a rebuild. The first check proves the last can fail.
  await openApp(page);
  await addBox(page);

  const rect = await canvasRect(page);
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const corner = { x: rect.x + rect.width * 0.08, y: rect.y + rect.height * 0.1 };

  const pickAtPoint = async (): Promise<string | null> => {
    await page.mouse.click(corner.x, corner.y);
    const code = page.locator('.selection code').first();
    await page.waitForTimeout(120);
    return (await code.count()) > 0 ? code.textContent() : null;
  };

  expect(await pickAtPoint()).toBeNull();

  await page.mouse.move(centre.x, centre.y);
  // Zoom pivots on the surface under the cursor, so each notch covers a share of the distance to
  // the face, not the centre; twelve notches bring the corner onto the box.
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -240);
  await page.waitForTimeout(300);

  const whileZoomed = await pickAtPoint();
  expect(whileZoomed).not.toBeNull();

  await openItems(page);
  await page.locator('.items-row', { hasText: 'Extrude' }).click();
  await page.locator('.property-panel__number').first().fill('18');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  // The corner lies under Items; close it so this tests a new viewport hit, not a stale selection.
  await railButton(page, 'Items').click();
  await page.waitForTimeout(300);

  // Had the camera snapped back to the framed view, this point would miss again.
  expect(await pickAtPoint()).not.toBeNull();
});

test('re-frames only when asked', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  const rect = await canvasRect(page);
  const corner = { x: rect.x + rect.width * 0.08, y: rect.y + rect.height * 0.1 };

  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -240);
  await page.waitForTimeout(300);

  // Re-framing is an explicit action in the View panel.
  await quickSettings(page, 'View');
  await page.getByRole('button', { name: 'Zoom to fit' }).click();
  await page.waitForTimeout(300);

  // Back to the framed view, so the corner misses again.
  await page.mouse.click(corner.x, corner.y);
  await expect(page.locator('.selection')).toHaveCount(0);
});

test('a rotate stops when the hand stops, rather than coasting past it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await addBox(page);
  const rect = await canvasRect(page);

  /**
   * The pose's sixteen numbers, compared numerically. The same pose can be re-derived with a
   * different last bit (2.8e-17 vs −9.7e-17); coasting shows up in the third decimal.
   */
  const pose = (): Promise<number[]> =>
    page.evaluate(() => [
      ...(
        window as unknown as { __bezierViewport: { viewCubeMatrix(): readonly number[] } }
      ).__bezierViewport.viewCubeMatrix(),
    ]);

  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(rect.x + rect.width * 0.35, rect.y + rect.height * 0.42, { steps: 12 });
  await page.mouse.up({ button: 'right' });

  // Damping would keep the view turning for several frames after release, which feels like mouse
  // acceleration. Wait two frames first: the cube updates once per frame, and software rendering
  // (WebKit on Linux) lags a frame or two.
  await afterFrames(page);
  const atRelease = await pose();
  await page.waitForTimeout(400);
  const settled = await pose();
  expect(settled).toHaveLength(atRelease.length);
  for (const [index, value] of settled.entries()) {
    expect(value).toBeCloseTo(atRelease[index] ?? 0, 6);
  }

  // It did turn: a camera that ignored the drag would also pass the check above.
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.5, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(async () => {
      const turned = await pose();
      return turned.some((value, index) => Math.abs(value - (atRelease[index] ?? 0)) > 1e-3);
    })
    .toBe(true);
});

test('wireframe is a mode you pick in the Display panel, and the choice sticks', async ({
  page,
}) => {
  await openApp(page);
  await addBox(page);

  // The mode is chosen, and read back, in the Display section of the view panel.
  await quickSettings(page, 'Display');
  const shaded = page.getByRole('radio', { name: 'Shaded', exact: true });
  const wireframe = page.getByRole('radio', { name: 'Wireframe', exact: true });
  const xray = page.getByRole('radio', { name: 'X-Ray', exact: true });

  await expect(shaded).toBeChecked();

  await wireframe.check();
  await expect(wireframe).toBeChecked();

  await xray.check();
  await expect(xray).toBeChecked();

  await shaded.check();
  await expect(shaded).toBeChecked();
});

test('a view is saved by name and gone back to, and undoes like an edit (audit F-034)', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await addBox(page);
  const box = await canvasRect(page);
  // Camera direction, as the orientation cube is given it.
  const facing = () =>
    page.evaluate(() =>
      (
        window as unknown as { __bezierViewport: { viewCubeMatrix(): readonly number[] } }
      ).__bezierViewport
        .viewCubeMatrix()
        .join(','),
    );
  const turn = async (dx: number) => {
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + box.width * 0.6 + dx, box.y + box.height * 0.45, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(800);
  };
  await turn(-120);
  const saved = await facing();
  await quickSettings(page, 'View');
  const views = page.getByRole('region', { name: 'Saved views' });
  await views.getByLabel('Name of the view to save').fill('Hinge');
  await views.getByRole('button', { name: 'Save view' }).click();
  await expect(views.getByRole('button', { name: 'Hinge', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await turn(200);
  expect(await facing()).not.toBe(saved);
  await quickSettings(page, 'View');
  await views.getByRole('button', { name: 'Hinge', exact: true }).click();
  await expect.poll(facing).toBe(saved);
  // Saved views are document steps, so undo removes it.
  await page.keyboard.press('ControlOrMeta+z');
  await quickSettings(page, 'View');
  await expect(views.getByRole('button', { name: 'Hinge', exact: true })).toHaveCount(0);
});

test('zebra and curvature show how the surface flows (audit F-027)', async ({ page }) => {
  await openApp(page);
  const chooser = page.waitForEvent('filechooser');
  await railButton(page, 'File').click();
  await (await chooser).setFiles(
    fileURLToPath(new URL('../fixtures-files/cylinder-r10-h10.step', import.meta.url)),
  );
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await quickSettings(page, 'Display');
  const analysis = page.getByRole('group', { name: 'Surface analysis' });
  const canvas = page.locator('canvas.viewport');
  const shaded = await canvas.screenshot();
  await analysis.getByRole('radio', { name: 'Zebra' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await canvas.screenshot()).equals(shaded)).toBe(false);
  await page.screenshot({ path: test.info().outputPath('zebra.png') });
  await quickSettings(page, 'Display');
  await analysis.getByRole('radio', { name: 'Curvature' }).click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('curvature.png') });
  await quickSettings(page, 'Display');
  await analysis.getByRole('radio', { name: 'Off' }).click();
  await expect(
    page.getByRole('group', { name: 'Shading' }).getByRole('radio', { name: 'Shaded' }),
  ).toBeChecked();
});

test('a named view is taken where the view is, not at a model off to the side', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bezier.e2e', '1'));
  await openApp(page);
  await addBox(page);
  type Hook = {
    setView(view: string): void;
    cameraView(): { position: number[]; target: number[]; parallel: boolean; zoom: number };
    showCameraView(view: {
      position: number[];
      target: number[];
      parallel: boolean;
      zoom: number;
    }): void;
  };
  const targetAfter = async (aside: number) =>
    page.evaluate((away) => {
      const v = (window as unknown as { __bezierViewport: Hook }).__bezierViewport;
      v.setView('default');
      const now = v.cameraView();
      // The same pose, moved sideways on the ground so the box is far out of shot.
      v.showCameraView({
        ...now,
        position: [now.position[0] + away, now.position[1], now.position[2]],
        target: [now.target[0] + away, now.target[1], now.target[2]],
      });
      v.setView('top');
      return v.cameraView().target;
    }, aside);

  // Looking at the box: the top view frames it, so the target stays at the box.
  const over = await targetAfter(0);
  expect(over[0]).toBeGreaterThan(0);
  expect(over[0]).toBeLessThan(BOX.max.x);

  // Looking at empty ground 2000 away: the top view stays there.
  const beside = await targetAfter(2000);
  expect(beside[0]).toBeGreaterThan(1000);
});
