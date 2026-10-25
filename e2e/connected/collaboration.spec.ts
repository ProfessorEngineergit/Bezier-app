/**
 * Collaboration against a real Bezier server (ADR 0015): enabling it, creating an account, sharing
 * a project, both users editing it at once and seeing each other's changes, branching and merging,
 * and read-only access for a reader and a link. Two browser contexts act as two devices with
 * separate storage and identities.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { addBox, expectSaid, onAlpha, openApp, openItems } from '../app.js';
import { expect, test } from '../fixtures.js';

const PORT = 18_950;
const SERVER = `http://127.0.0.1:${PORT}`;
const CODE = 'e2e-enrollment-code-for-collab';
let server: ChildProcess;
let data = '';

test.describe.configure({ mode: 'serial' });

// Collaboration is alpha-only.
test.beforeEach(async ({ page }) => onAlpha(page));

test.beforeAll(async () => {
  data = mkdtempSync(join(tmpdir(), 'bezier-e2e-sync-'));
  server = spawn('node', ['apps/sync-server/server/main.ts', 'serve'], {
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      BEZIER_SYNC_DATA: data,
      BEZIER_SYNC_PORT: String(PORT),
      BEZIER_SYNC_ENROLLMENT: CODE,
    },
    stdio: 'ignore',
  });
  await expect
    .poll(
      () =>
        fetch(`${SERVER}/v1/health`)
          .then((r) => r.status)
          .catch(() => 0),
      {
        timeout: 15_000,
      },
    )
    .toBe(200);
});

test.afterAll(() => {
  server.kill();
  rmSync(data, { recursive: true, force: true });
});

async function collaborationSettings(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await page
    .getByRole('navigation', { name: 'Preference sections' })
    .getByRole('button', { name: /^Collaboration/ })
    .click();
}

async function switchOn(page: Page, name: string, machine: string): Promise<void> {
  await collaborationSettings(page);
  await page.getByRole('checkbox', { name: 'Collaboration' }).check();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Your name').blur();
  await page.getByLabel('This machine').fill(machine);
  await page.getByLabel('This machine').blur();
}

async function device(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await onAlpha(page);
  // A fresh device: the fixtures did not mark Nib as met here, so his greeting would cover the
  // window.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.nib', JSON.stringify({ met: true, guides: [] }));
    localStorage.setItem(
      'bezier.nib.offered',
      JSON.stringify(['design', 'visualize', 'drawings', 'simulation']),
    );
  });
  page.on('pageerror', (error) => console.error(`[second device] ${error.message}`));
  return page;
}

async function rename(page: Page, name: string): Promise<void> {
  await page.locator('.titlebar__name').click();
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Project name').press('Enter');
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

async function connect(page: Page, name: string, machine: string): Promise<void> {
  await switchOn(page, name, machine);
  await page.getByRole('button', { name: /Create an account/ }).click();
  await page.getByLabel('Server', { exact: true }).fill(SERVER);
  await page.getByLabel('Enrollment code').fill(CODE);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByTestId('collab-user-id')).toHaveText(/^[0-9a-f]{32}$/);
}

async function joinWith(page: Page, invite: string, name: string, machine: string) {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await switchOn(page, name, machine);
  await page.getByRole('button', { name: /I have an invite link/ }).click();
  await page.getByLabel('Invite link').fill(invite);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByTestId('shared-vault')).not.toHaveCount(0);
}

/** Shares the first project on the start page from its menu; returns its name. */
async function shareFirst(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'All Projects' }).first().click();
  const tile = page.locator('.tile').first();
  const name = (await tile.locator('.tile__name').textContent()) ?? '';
  await tile.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Share…' }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('heading', { name: `“${name}” is shared` })).toBeVisible();
  return name;
}

/** Opens a shared project from the start page, like any other project. */
async function openProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'All Projects' }).first().click();
  const tile = page.locator('.tile[data-shared]').filter({ hasText: name });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await tile.locator('.tile__face').click();
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expect(page.locator('html[data-busy]')).toHaveCount(0);
}

test('two people work in one project at the same time, and branch from a change', async ({
  page,
  browser,
}) => {
  // Alice has a local project and collaboration off.
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('.library')).toBeVisible();

  await collaborationSettings(page);
  // While off, the page explains the feature and the start page has no Shared section.
  await expect(page.getByRole('heading', { name: 'Work on one model together.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shared' })).toHaveCount(0);
  await connect(page, 'Alice', 'Workshop PC');

  // Shared from the project's menu, with an invite for Bob created in the same dialog.
  const project = await shareFirst(page);
  await page.getByTestId('make-invite').click();
  const invite = await page.getByTestId('invite-link').inputValue();
  expect(invite).toMatch(/#join=/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.tile[data-shared]')).toContainText('Shared');

  // Bob joins with the link: the project is listed among his and opens like any other.
  const bob = await device(browser);
  await joinWith(bob, invite, 'Bob', 'Bob’s MacBook');
  await openProject(bob, project);
  await expect(bob.getByTestId('project-people')).toContainText('Live');

  // Alice opens it too and sees Bob present.
  await openProject(page, project);
  await expect(page.getByTestId('project-people')).toContainText('Bob', { timeout: 30_000 });
  await expect(page.getByTestId('project-people')).toContainText('Bob’s MacBook');
  await page.screenshot({ path: test.info().outputPath('live-people.png') });

  // Bob renames it; Alice's open project updates without reopening.
  await rename(bob, 'Bracket');
  await expect(page.locator('.titlebar__name')).toHaveText('Bracket', { timeout: 15_000 });
  // And the other way round.
  await rename(page, 'Bracket v2');
  await expect(bob.locator('.titlebar__name')).toHaveText('Bracket v2', { timeout: 15_000 });

  // Alice branches from before Bob's rename to try her own.
  await page.getByTestId('project-people').click();
  const changes = page.getByTestId('project-changes');
  const bobs = changes.locator('li').filter({ hasText: 'Bob' }).first();
  await expect(bobs).toBeVisible();
  await bobs.getByRole('button', { name: 'Branch from before' }).click();
  await changes.getByLabel('Branch name').fill('idea');
  await changes.getByRole('button', { name: 'Start branch' }).click();
  await expect(page.locator('.titlebar__name')).toHaveText(`${project} (idea)`, {
    timeout: 20_000,
  });
  await expect(page.getByTestId('project-people')).toContainText('Live');
  // A change on the branch: name the extrusion.
  await openItems(page);
  await page.locator('.items-row', { hasText: 'Extrude' }).dblclick();
  await page.locator('.items-row--input').fill('Base Plate');
  await page.locator('.items-row--input').press('Enter');
  await expect(page.locator('.items-row', { hasText: 'Base Plate' })).toBeVisible();

  // Merge: the branch's change lands in the project Bob has open.
  await page.getByTestId('project-people').click();
  await page.getByRole('button', { name: /^Merge into/ }).click();
  await expect(page.getByTestId('project-changes')).toContainText('Merged');
  // Bob's project updates live, and its history shows who did what.
  await bob.getByTestId('project-people').click();
  const latest = bob.getByTestId('project-changes').locator('li').first();
  await expect(latest).toContainText('Alice', { timeout: 15_000 });
  await expect(latest).toContainText('Base Plate');
  await bob.screenshot({ path: test.info().outputPath('live-changes.png') });

  await bob.context().close();
});

test('a reader follows a shared project and cannot change it', async ({ page, browser }) => {
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: 'Projects' }).click();
  await connect(page, 'Alice', 'Workshop PC');
  const project = await shareFirst(page);
  await page.getByLabel('Invite as').selectOption('reader');
  await page.getByTestId('make-invite').click();
  const invite = await page.getByTestId('invite-link').inputValue();
  await page.getByRole('button', { name: 'Done' }).click();

  const carol = await device(browser);
  await joinWith(carol, invite, 'Carol', 'Office');
  await openProject(carol, project);
  await expectSaid(carol, 'View only');
  await expect(carol.getByTestId('project-people')).toContainText('view only');

  // An edit is refused, with a reason.
  await rename(carol, 'Mine now');
  await expectSaid(carol, 'shared with you to look at');

  // Alice's edits reach the reader live.
  await openProject(page, project);
  await rename(page, 'Plate');
  await expect(carol.locator('.titlebar__name')).toHaveText('Plate', { timeout: 15_000 });
  await carol.context().close();
});

test('a read-only link opens in Bezier without an account, to look at only', async ({
  page,
  browser,
}) => {
  await openApp(page);
  await addBox(page);
  await page.getByRole('button', { name: 'Projects' }).click();
  await connect(page, 'Alice', 'Workshop PC');
  const project = await shareFirst(page);
  await page.getByLabel('What the link is for').fill('Review');
  await page.getByTestId('make-view-link').click();
  const link = await page.getByTestId('view-link').inputValue();
  expect(link).toMatch(/#view=/);
  await page.getByRole('button', { name: 'Done' }).click();

  // Dave has no account: collaboration on, no server, only the link.
  const dave = await device(browser);
  await dave.goto('/');
  await expect(dave.locator('.library[data-loaded]')).toBeVisible();
  await switchOn(dave, 'Dave', 'Laptop');
  await dave.getByRole('button', { name: 'Open a shared link' }).click();
  await dave.getByLabel('Shared link', { exact: true }).fill(link);
  await dave.getByLabel('Shared link', { exact: true }).press('Enter');
  await expect(dave.getByTestId('shared-vault')).toContainText('View only');
  await expect(dave.getByRole('button', { name: 'People' })).toHaveCount(0);
  await openProject(dave, project);
  await expectSaid(dave, 'View only');
  await rename(dave, 'Not allowed');
  await expectSaid(dave, 'shared with you to look at');
  await dave.context().close();
});
