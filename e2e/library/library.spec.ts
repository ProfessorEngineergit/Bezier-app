import { addBox, openApp, said } from '../app.js';
import { expect, test } from '../fixtures.js';

if (process.env.DELETE_PREVIEW === '1') {
  test.use({ video: { mode: 'on', size: { width: 900, height: 600 } } });
}

/** Opens the library holding one project with content. */
async function openLibrary(page: Parameters<typeof openApp>[0]): Promise<void> {
  await openApp(page);
  // Empty projects are not kept, so add a box.
  await addBox(page);
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('.library')).toBeVisible();
}

test('a new project left without doing anything is not kept', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('.library')).toBeVisible();
  await expect(page.locator('.tile')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.library')).toBeVisible();
  await expect(page.locator('.tile')).toHaveCount(0);
});

/** The start page accent per scheme: the logo's silver on dark, graphite on light. */
const MONO = { dark: '#ececee', light: '#1d1d1f' };

test('home opens on every project, in monochrome, with settings at the foot', async ({ page }) => {
  await openLibrary(page);

  await expect(page.locator('.workspace')).toHaveAttribute('inert', '');
  await expect(page.locator('.workspace')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('button', { name: /Back to workspace/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cloud/ })).toHaveCount(0);

  // The page opens on a single list of every project, its only title.
  await expect(page.getByRole('heading', { level: 1, name: 'All Projects' })).toBeVisible();
  await expect(page.locator('.tile')).toHaveCount(1);

  // The start page accent is the logo's graphite or silver, not blue.
  const expectedAccent = await page.evaluate(
    (mono) => (matchMedia('(prefers-color-scheme: dark)').matches ? mono.dark : mono.light),
    MONO,
  );
  await expect
    .poll(() =>
      page
        .locator('.library')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--accent').trim()),
    )
    .toBe(expectedAccent);

  // Settings sits below the folders. Lessons live in the editor, not here.
  const foot = page.getByRole('navigation', { name: 'More' });
  await expect(foot.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(foot.getByRole('button', { name: 'Tutorials' })).toHaveCount(0);
  const footTop = (await foot.boundingBox())?.y ?? 0;
  const foldersTop = (await page.locator('.library-sidebar__section').boundingBox())?.y ?? 0;
  expect(footTop).toBeGreaterThan(foldersTop);

  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Search projects' })).toBeFocused();
  await page.keyboard.press('Escape');
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: /^All Projects/ })
    .focus();
  // Slash focuses the sidebar search; Control+K opens the wiki from anywhere.
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Search the wiki' })).toBeVisible();
  await page.keyboard.press('Escape');

  const sidebar = page.locator('.library-sidebar');
  const initialWidth = (await sidebar.boundingBox())?.width;
  const resizeHandle = page.getByRole('separator', { name: 'Resize sidebar' });
  await resizeHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width)
    .toBe((initialWidth ?? 232) + 8);
  await page.keyboard.press('Home');
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(232);

  const handleBounds = await resizeHandle.boundingBox();
  if (handleBounds === null) throw new Error('Sidebar resize handle has no bounds');
  await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + 48);
  await page.mouse.down();
  await page.mouse.move(handleBounds.x + handleBounds.width / 2 + 24, handleBounds.y + 48);
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(256);
  await resizeHandle.dblclick();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(232);

  await foot.getByRole('button', { name: 'Settings' }).click();
  const preferences = page.getByRole('region', { name: 'Preferences' });
  await expect(preferences).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0);
  expect(await preferences.evaluate((element) => element.closest('.library__body') !== null)).toBe(
    true,
  );
  await expect
    .poll(() => preferences.evaluate((element) => getComputedStyle(element).position))
    .toBe('static');
  await expect
    .poll(() => preferences.evaluate((element) => getComputedStyle(element).fontFamily))
    .not.toContain('Times');
  await preferences.getByRole('button', { name: 'Appearance', exact: true }).click();
  await preferences.getByRole('radio', { name: 'Light' }).check();
  await expect
    .poll(() =>
      preferences.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--accent').trim(),
      ),
    )
    .toBe(MONO.light);
  // The selected row uses a tint of the text colour, not a filled accent block.
  await expect
    .poll(() =>
      foot
        .getByRole('button', { name: 'Settings' })
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe('rgba(0, 0, 0, 0.08)');
  await preferences.getByRole('radio', { name: 'Dark' }).check();
  await expect
    .poll(() =>
      preferences.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--accent').trim(),
      ),
    )
    .toBe(MONO.dark);
  // Every section holds real controls, not descriptions of features that do not exist.
  const viewportTab = preferences.getByRole('button', { name: 'Viewport', exact: true });
  await viewportTab.click();
  await expect(preferences.getByRole('heading', { name: 'Viewport' })).toBeVisible();
  await expect(preferences.getByRole('radio', { name: /Balanced/ })).toBeVisible();

  // Shortcuts reflects the actual bindings.
  await preferences.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await expect(preferences.getByText('Undo', { exact: true })).toBeVisible();
  await expect(preferences.getByText('Chamfer/Fillet', { exact: true })).toBeVisible();

  // End reaches the last section by keyboard, and arrow keys open sections as they reach them.
  await viewportTab.focus();
  await page.keyboard.press('End');
  await expect(preferences.getByRole('heading', { name: 'Contribute' })).toBeVisible();
  // Unbuilt features say so in one word; nothing claims to work before it does.
  await preferences.getByRole('button', { name: 'Data & Privacy', exact: true }).click();
  await expect(preferences.getByRole('heading', { name: 'Data & Privacy' })).toBeVisible();
  await expect(preferences.getByText('In development', { exact: true }).first()).toBeVisible();
});

test('a project renames in place, from its name or from its menu', async ({ page }) => {
  await openLibrary(page);
  const card = page.locator('.tile').first();
  const name = card.locator('.tile__name');
  const field = page.getByRole('textbox', { name: 'Project name' });
  const original = (await name.textContent()) ?? '';

  // Escape reverts the name and closes only the edit, not the page.
  await name.click();
  await expect(field).toBeFocused();
  await field.fill('Discarded');
  await field.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(name).toHaveText(original);
  await expect(page.locator('.library')).toBeVisible();

  await name.click();
  await field.fill('Enclosure');
  await field.press('Enter');
  await expect(name).toHaveText('Enclosure');

  // The menu's Rename… uses the same inline field, not a dialog.
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await expect(field).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await field.fill('Enclosure lid');
  await field.press('Enter');
  await expect(name).toHaveText('Enclosure lid');

  await page.reload();
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('.tile__name').first()).toHaveText('Enclosure lid');
});

test('folder menus are compact, contextual, and fully keyboard reachable', async ({ page }) => {
  await openLibrary(page);
  await page.locator('.library-sidebar__section > header button').first().click();

  const sidebar = page.locator('.library-sidebar');
  const folder = page.locator('.library-folder').first();
  await folder.click({ button: 'right', position: { x: 96, y: 15 } });

  const menu = page.getByRole('menu', { name: 'Folder actions for New Folder' });
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused();
  const menuBounds = await menu.boundingBox();
  const sidebarBounds = await sidebar.boundingBox();
  if (menuBounds === null || sidebarBounds === null) throw new Error('Folder menu has no bounds');
  expect(menuBounds.width).toBe(152);
  expect(menuBounds.x).toBeGreaterThanOrEqual(sidebarBounds.x + 8);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(
    sidebarBounds.x + sidebarBounds.width,
  );

  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Rename…' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await folder.locator('.library-folder__open').click();
  const more = page.getByRole('button', { name: 'More options for New Folder' });
  await more.hover();
  // On the selected row the button takes the row's colour instead of greying out.
  const rowColor = await folder.evaluate((element) => getComputedStyle(element).color);
  await expect
    .poll(() => more.evaluate((element) => getComputedStyle(element).color))
    .toBe(rowColor);
  await more.click();
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Rename…' }).click();
  const folderName = page.getByRole('textbox', { name: 'Folder name' });
  await folderName.fill('Parts');
  await folderName.press('Enter');
  await expect(folder).toContainText('Parts');

  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Delete folder?');
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(folder).toBeVisible();
});

test('projects move into folders by drag and drop and by the project menu', async ({ page }) => {
  await openLibrary(page);
  await page.locator('.library-sidebar__section > header button').first().click();
  const projects = page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: /^All Projects/ });
  await projects.click();

  const folder = page.locator('.library-folder').first();
  const card = page.locator('.tile').first();
  await expect(folder).toContainText('New Folder');
  await card.dragTo(folder);

  // All Projects lists every project wherever it is filed, so it is still there; the folder now
  // holds it too.
  await expect(folder).toContainText('1');
  await expect(page.locator('.tile')).toHaveCount(1);
  await folder.locator('.library-folder__open').click();
  await expect(page.locator('.tile')).toHaveCount(1);

  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await expect(page.getByText(/Visibility/)).toHaveCount(0);
  const move = page.getByRole('menuitem', { name: 'Move to Folder…' });
  await expect(move).toBeEnabled();
  await move.click();
  await page
    .getByRole('dialog', { name: 'Move project' })
    .getByRole('button', {
      name: 'Projects',
    })
    .click();

  await projects.click();
  await expect(page.locator('.tile')).toHaveCount(1);
});

test('overlapping library edits do not race on index.json', async ({ page }) => {
  // Concurrent writes to the same OPFS key must not race on `move()`: OPFS locks the destination
  // during the first move, and the second fails with "cannot be moved to a destination which is
  // locked". Firing several index-changing actions without awaiting reproduces the overlap.
  await openLibrary(page);
  const newFolder = page.locator('.library-sidebar__section > header button').first();

  await Promise.all([newFolder.click(), newFolder.click(), newFolder.click()]);
  await expect(page.locator('.library-folder')).toHaveCount(3);

  await expect(page.getByText(/cannot be moved|FileSystemHandle|\.tmp/i)).toHaveCount(0);

  // Survives a reload, so every write landed and none left the UI ahead of storage.
  await page.reload();
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('.library-folder')).toHaveCount(3);
});

test('delete waits for explicit confirmation, then the card itself dissolves', async ({ page }) => {
  await page.clock.install();
  await openLibrary(page);
  const more = page.getByRole('button', { name: 'More options', exact: true });

  await more.click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('This cannot be undone');
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.tile')).toHaveCount(1);
  await expect(page.locator('.tile[data-leaving]')).toHaveCount(0);

  await more.click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  // The card animates out on its own while the dialog is already gone.
  const leaving = page.locator('.tile[data-leaving]');
  await expect(leaving).toHaveCount(1);
  await expect(leaving).toHaveCSS('animation-name', 'tile-leave');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.tile')).toHaveCount(1);
  await page.clock.runFor(400);
  await expect(page.locator('.tile')).toHaveCount(0);
  await expect(said(page)).toContainText('Project “Untitled” deleted');
  await page.reload();
  await expect(page.locator('.tile')).toHaveCount(0);
});

test('reduced-motion project deletion is at once and still reports success', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLibrary(page);
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.tile')).toHaveCount(0);
  await expect(said(page)).toContainText('Project “Untitled” deleted');
});

test.describe('project deletion at the smallest desktop window', () => {
  test('the dialog stays within the window and confirms by keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await openLibrary(page);
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const confirmation = page.getByRole('alertdialog');
    const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancel).toBeFocused();
    const bounds = await confirmation.boundingBox();
    if (bounds === null) throw new Error('The delete confirmation has no bounds');
    expect(bounds.x).toBeGreaterThanOrEqual(16);
    expect(bounds.y).toBeGreaterThanOrEqual(16);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(884);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(584);
    await page.keyboard.press('Tab');
    await expect(confirmation.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(confirmation.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.tile')).toHaveCount(0);
    await expect(said(page)).toContainText('Project “Untitled” deleted');
  });
});

test('a card shows the last look at its project, not a placeholder', async ({ page }) => {
  await openApp(page);
  await addBox(page);

  // The thumbnail is taken on leaving, showing the last state the user saw.
  await page.getByRole('button', { name: 'Projects' }).click();
  const shot = page.locator('.tile__shot').first();
  await expect(shot).toBeVisible();
  await expect
    .poll(() => shot.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator('.tile__thumb')).toHaveCount(0);
});
