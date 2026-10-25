/**
 * Release channels: the app starts on stable with alpha and beta features hidden; the switch in
 * Settings, Updates applies a channel immediately and shows its name under the logo; alpha requires
 * an invitation code, verified on the device.
 */

import type { Page } from '@playwright/test';
import { onAlpha, withTestKey } from '../app.js';
import { expect, test } from '../fixtures.js';
import { testInviteCode } from '../invite-test-key.js';

const library = (page: Page) => page.getByRole('navigation', { name: 'Library' });
const sections = (page: Page) => page.getByRole('navigation', { name: 'Preference sections' });

async function updates(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await sections(page).getByRole('button', { name: 'Updates' }).click();
}

test('the app starts on stable: a wiki, and nothing that reaches a server', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expect(library(page).getByRole('button', { name: 'Wiki', exact: true })).toBeVisible();
  await expect(library(page).getByRole('button', { name: /^Community/ })).toHaveCount(0);
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveCount(0);

  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await expect(sections(page).getByRole('button', { name: 'Collaboration' })).toHaveCount(0);
  await expect(sections(page).getByRole('button', { name: /^Community/ })).toHaveCount(0);
});

test('the wiki on stable is read and not written', async ({ page }) => {
  await page.goto('/');
  await library(page).getByRole('button', { name: 'Wiki', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Getting around' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New article' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Leaderboard' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Orbit, pan and zoom/ }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
});

test('beta is a channel of its own, with Beta under the logo, and holds back nothing yet', async ({
  page,
}) => {
  await updates(page);
  await expect(page.getByRole('radio', { name: 'Stable' })).toBeChecked();

  await page.getByRole('radio', { name: 'Beta' }).check();
  // No reload: still the same page.
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveText('Beta');
  await expect(library(page).getByRole('button', { name: 'Wiki', exact: true })).toBeVisible();
  await expect(sections(page).getByRole('button', { name: /^Collaboration/ })).toHaveCount(0);

  await page.getByRole('radio', { name: 'Stable' }).check();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveCount(0);
});

test('alpha asks for a code, turns a wrong one away, and opens at once with a good one', async ({
  page,
}) => {
  await withTestKey(page);
  await updates(page);

  // Choosing alpha without an invitation asks for one and switches nothing.
  await page.getByRole('radio', { name: 'Alpha' }).check();
  const field = page.getByRole('textbox', { name: 'Invitation code' });
  await expect(field).toBeVisible();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveCount(0);

  await field.fill('BZ-not-a-code');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That is not an invitation code')).toBeVisible();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveCount(0);

  await field.fill(testInviteCode());
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveText('Alpha');
  await expect(library(page).getByRole('button', { name: /^Community/ })).toBeVisible();
  await expect(sections(page).getByRole('button', { name: /^Collaboration/ })).toBeVisible();
  await expect(sections(page).getByRole('button', { name: /^Community/ })).toBeVisible();
  await expect(page.getByText('Good for alpha, with no end date.')).toBeVisible();

  // It persists and is verified again on the next start.
  await page.reload();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveText('Alpha');
});

test('removing the invitation leaves alpha for beta, and alpha asks again', async ({ page }) => {
  await onAlpha(page);
  await updates(page);
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveText('Alpha');
  await page.getByRole('button', { name: 'Remove invitation' }).click();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveText('Beta');
  await expect(library(page).getByRole('button', { name: /^Community/ })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Alpha' }).check();
  await expect(page.getByRole('textbox', { name: 'Invitation code' })).toBeVisible();
});

test('alpha cannot be had by writing it into storage: without a good code it is beta', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.channel', 'alpha');
  });
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveText('Beta');
  await expect(library(page).getByRole('button', { name: /^Community/ })).toHaveCount(0);
});

test('an invitation that has run out is turned away at the start, and forgotten', async ({
  page,
}) => {
  await onAlpha(page, 1);
  await page.goto('/');
  await expect(page.locator('.library[data-loaded]')).toBeVisible();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveText('Beta');
  expect(await page.evaluate(() => localStorage.getItem('bezier.invite'))).toBeNull();
});

test('the channel is kept for the next time', async ({ page }) => {
  await updates(page);
  await page.getByRole('radio', { name: 'Beta' }).check();
  await page.reload();
  await expect(page.locator('.library-sidebar__titles .beta-tag')).toHaveText('Beta');
});
