/** Pictures for the collaboration article. */

import type { Page } from '@playwright/test';
import { addBox } from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';
import { ENROLLMENT, serverUrl } from './sync-server.js';

async function settings(page: Page): Promise<void> {
  // Only in the editor; the start page has no such button.
  const home = page.getByRole('button', { name: 'Projects', exact: true });
  if (await home.isVisible()) await home.click();
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await page
    .getByRole('navigation', { name: 'Preference sections' })
    .getByRole('button', { name: 'Collaboration' })
    .click();
}

/** Enabled, with a name and machine, and connected to this worker's server. */
async function connected(page: Page, name: string, machine: string): Promise<void> {
  await settings(page);
  await page.getByRole('checkbox', { name: 'Collaboration' }).check();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Your name').blur();
  await page.getByLabel('This machine').fill(machine);
  await page.getByLabel('This machine').blur();
  await page.getByRole('button', { name: /Create an account/ }).click();
  await page.getByLabel('Server', { exact: true }).fill(serverUrl);
  await page.getByLabel('Enrollment code').fill(ENROLLMENT);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByTestId('collab-user-id')).toHaveText(/^[0-9a-f]{32}$/);
}

/** Shares the first project from its menu and stays in the dialog. */
async function shareDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'All Projects' }).first().click();
  const tile = page.locator('.tile').first();
  await tile.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Share…' }).click();
}

export const COLLAB: Record<string, State> = {
  'collaboration-settings': async (page) => {
    await settings(page);
    await page.getByRole('checkbox', { name: 'Collaboration' }).check();
    const connect = page.getByRole('button', { name: /Create an account/ });
    await expect(connect).toBeVisible();
    return {
      points: [page.getByRole('checkbox', { name: 'Collaboration' })],
      area: [page.getByRole('checkbox', { name: 'Collaboration' }), connect],
    };
  },
  'collaboration-share': async (page) => {
    await addBox(page);
    await page.getByRole('button', { name: 'Projects' }).click();
    await connected(page, 'Alice', 'Workshop PC');
    await shareDialog(page);
    const share = page.getByRole('button', { name: 'Share', exact: true });
    await expect(share).toBeVisible();
    return { points: [share], area: [page.locator('.library-dialog')] };
  },
  'collaboration-live': async (page) => {
    await addBox(page);
    await page.getByRole('button', { name: 'Projects' }).click();
    await connected(page, 'Alice', 'Workshop PC');
    await shareDialog(page);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByTestId('make-invite').click();
    const invite = await page.getByTestId('invite-link').inputValue();
    await page.getByRole('button', { name: 'Done' }).click();

    const browser = page.context().browser();
    if (browser === null) throw new Error('no browser');
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bob = await other.newPage();
    await bob.goto('/');
    await expect(bob.locator('.library[data-loaded]')).toBeVisible();
    await settings(bob);
    await bob.getByRole('checkbox', { name: 'Collaboration' }).check();
    await bob.getByLabel('Your name').fill('Bob');
    await bob.getByLabel('Your name').blur();
    await bob.getByLabel('This machine').fill('Bob’s MacBook');
    await bob.getByLabel('This machine').blur();
    await bob.getByRole('button', { name: /I have an invite link/ }).click();
    await bob.getByLabel('Invite link').fill(invite);
    await bob.getByRole('button', { name: 'Connect' }).click();
    await bob.getByRole('button', { name: 'All Projects' }).first().click();
    const shared = bob.locator('.tile[data-shared]').first();
    await expect(shared).toBeVisible({ timeout: 30_000 });
    await shared.locator('.tile__face').click();
    await expect(bob.locator('canvas.viewport')).toBeVisible();

    await page.getByRole('button', { name: 'All Projects' }).first().click();
    await page.locator('.tile[data-shared]').first().locator('.tile__face').click();
    await expect(page.locator('canvas.viewport')).toBeVisible();
    const bar = page.getByTestId('project-people');
    await expect(bar).toContainText('Bob', { timeout: 30_000 });
    return { points: [bar], area: [bar, page.locator('canvas.viewport')] };
  },
  'collaboration-changes': async (page) => {
    await addBox(page);
    await page.getByRole('button', { name: 'Projects' }).click();
    await connected(page, 'Alice', 'Workshop PC');
    await shareDialog(page);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.locator('.tile[data-shared]').first().locator('.tile__face').click();
    await expect(page.locator('canvas.viewport')).toBeVisible();
    await page.locator('.titlebar__name').click();
    await page.getByLabel('Project name').fill('Bracket');
    await page.getByLabel('Project name').press('Enter');
    await expect(page.locator('html[data-busy]')).toHaveCount(0);
    await page.getByTestId('project-people').click();
    const list = page.getByTestId('project-changes');
    const branch = list.getByRole('button', { name: 'Branch from before' }).first();
    await expect(branch).toBeVisible({ timeout: 20_000 });
    return { points: [branch], area: [list] };
  },
};
