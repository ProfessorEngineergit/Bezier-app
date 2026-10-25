import type { Locator, Page } from '@playwright/test';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';

/** The start page's own Settings button, in the sidebar's More list. */
const settingsButton = (page: Page): Locator =>
  page.getByRole('navigation', { name: 'More' }).getByRole('button', { name: 'Settings' });

/** Opens Settings on the named page. The editor opens first, so this goes via the start page. */
async function openPage(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await settingsButton(page).click();
  await expect(page.getByRole('region', { name: 'Preferences' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Preference sections' })
    .getByRole('button', { name: label, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible();
}

/** A page's sidebar entry, for pointing at in a full-page picture. */
const entry = (page: Page, label: string): Locator =>
  page
    .getByRole('navigation', { name: 'Preference sections' })
    .getByRole('button', { name: label, exact: true });

const row = (page: Page, label: string): Locator =>
  page.locator('.prefs-row').filter({ hasText: label }).first();

/**
 * A page's heading and every group. Partial-page pictures crop to these rather than a single row,
 * so the crop edges fall in the space between groups.
 */
const content = (page: Page): Locator[] => [
  page.locator('.prefs-hero'),
  page.locator('.prefs-group').first(),
  page.locator('.prefs-group').last(),
];

export const SETTINGS: Record<string, State> = {
  'open-settings-sidebar': async (page) => {
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    const button = settingsButton(page);
    await expect(button).toBeVisible();
    return { points: [button], whole: true };
  },
  'open-settings-search': async (page) => {
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Search projects' });
    await search.fill('theme');
    const hits = page.getByRole('region', { name: 'Settings', exact: true });
    const appearance = hits.getByRole('button', { name: /Appearance/ });
    await expect(appearance).toBeVisible();
    return { points: [appearance], area: [search, hits] };
  },
  'open-settings-pages': async (page) => {
    await openPage(page, 'General');
    return { points: [page.getByRole('navigation', { name: 'Preference sections' })], whole: true };
  },

  'settings-general-page': async (page) => {
    await openPage(page, 'General');
    return { points: [entry(page, 'General')], whole: true };
  },
  'settings-general-interface': async (page) => {
    await openPage(page, 'General');
    const graph = page.getByRole('checkbox', { name: 'Show performance graph', exact: true });
    return { points: [graph], area: content(page) };
  },
  'settings-general-graph': async (page) => {
    // Create the box first, so there is a project to return to and a model under the top bar.
    const { addBox } = await import('../../app.js');
    await addBox(page);
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await settingsButton(page).click();
    await expect(page.getByRole('region', { name: 'Preferences' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Show performance graph', exact: true }).click();
    // Settings lives on the start page: go back to the projects to open the new one.
    await page.getByRole('button', { name: 'All Projects' }).click();
    await page.locator('.tile__face').first().click();
    const graph = page.locator('.performance-graph');
    await expect(graph).toBeVisible();
    return { points: [graph], area: [graph, page.getByRole('button', { name: /Workspace:/ })] };
  },

  'settings-appearance-page': async (page) => {
    await openPage(page, 'Appearance');
    return { points: [entry(page, 'Appearance')], whole: true };
  },
  'settings-appearance-materials': async (page) => {
    await openPage(page, 'Appearance');
    const glass = row(page, 'Glass');
    return { points: [glass], area: content(page) };
  },

  'settings-viewport-page': async (page) => {
    await openPage(page, 'Viewport');
    return { points: [entry(page, 'Viewport')], whole: true };
  },
  'settings-viewport-slider': async (page) => {
    await openPage(page, 'Viewport');
    const slider = page.locator('.prefs-slider');
    await expect(slider).toBeVisible();
    return { points: [slider], area: content(page) };
  },

  'settings-shortcuts-page': async (page) => {
    await openPage(page, 'Shortcuts');
    return { points: [entry(page, 'Shortcuts')], whole: true };
  },
  'settings-shortcuts-recording': async (page) => {
    await openPage(page, 'Shortcuts');
    const key = page.getByRole('button', { name: 'Shortcut for Extrude', exact: true });
    await key.click();
    await expect(key).toHaveText('Press keys…');
    return { points: [key], whole: true };
  },
  'settings-shortcuts-conflict': async (page) => {
    await openPage(page, 'Shortcuts');
    // Chamfer/Fillet shares Extrude's key, E, and both rows say so.
    const fillet = page.getByRole('button', { name: 'Shortcut for Chamfer/Fillet', exact: true });
    await fillet.click();
    await page.keyboard.press('e');
    await expect(page.getByText('Shares its key with another action')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Reset All Key Bindings' })).toBeVisible();
    return { points: [fillet], whole: true };
  },
  'settings-shortcuts-reset': async (page) => {
    await openPage(page, 'Shortcuts');
    await page.getByRole('button', { name: 'Shortcut for Chamfer/Fillet', exact: true }).click();
    await page.keyboard.press('e');
    const reset = page.getByRole('button', { name: 'Reset All Key Bindings' });
    await expect(reset).toBeVisible();
    return { points: [reset], whole: true };
  },

  'settings-updates-page': async (page) => {
    await openPage(page, 'Updates');
    return { points: [entry(page, 'Updates')], whole: true };
  },

  'settings-mcp-page': async (page) => {
    await openPage(page, 'MCP & Automation');
    return { points: [entry(page, 'MCP & Automation')], whole: true };
  },

  'settings-data-page': async (page) => {
    await openPage(page, 'Data & Privacy');
    return { points: [entry(page, 'Data & Privacy')], whole: true };
  },
  'settings-data-reset': async (page) => {
    await openPage(page, 'Data & Privacy');
    await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
    const confirm = page.getByRole('button', { name: 'Reset all settings', exact: true });
    await expect(confirm).toBeVisible();
    return { points: [confirm], area: content(page) };
  },

  'settings-contribute-page': async (page) => {
    await openPage(page, 'Contribute');
    return { points: [entry(page, 'Contribute')], whole: true };
  },
  'settings-contribute-actions': async (page) => {
    await openPage(page, 'Contribute');
    const bug = page.getByRole('button', { name: /Something broke/ });
    await expect(bug).toBeVisible();
    return { points: [bug], area: content(page) };
  },
};
