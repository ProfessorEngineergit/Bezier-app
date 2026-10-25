/**
 * A `test` that fails when the page logs a console error or throws an uncaught exception. Such
 * errors often point at real bugs (e.g. a missing React key) while every assertion stays green.
 */

import { test as base, expect } from '@playwright/test';

/** Known noise. Keep it short, and give each entry a reason. */
const IGNORED = [
  // Vite rewrites occt-wasm's sourcemaps and warns that the C++ sources are not shipped.
  /Sourcemap for .* points to missing source files/,
  // Chromium logs this for any WebGL context on a headless GPU-less runner.
  /Automatic fallback to software WebGL/,
];

export const test = base.extend<{ consoleErrors: string[]; developerView: boolean }>({
  /**
   * Turns on the history list and reference readout, which most tests read. A test about the
   * plain Items panel turns them off with its own init script, which runs after this one.
   */
  developerView: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        // Init scripts run in every frame; a plugin's sandboxed frame has no storage and throws.
        if (window !== window.top) return;
        // Dismiss the start-page tip, which would shift the layout. Its own tests reopen it.
        try {
          window.localStorage.setItem('bezier.tip.wiki', 'dismissed');
          // Headless browsers render in software, which switches the view cube to a canvas
          // (view-cube-canvas.ts). Tests click its faces by name; the canvas has its own tests.
          if (window.localStorage.getItem('bezier.paint') === null)
            window.localStorage.setItem('bezier.paint', 'full');
          // Skip Nib's greeting, which would cover the start page. Nib's tests reset it.
          if (window.localStorage.getItem('bezier.nib') === null)
            window.localStorage.setItem('bezier.nib', JSON.stringify({ met: true, guides: [] }));
          // Likewise for the first-lesson offers.
          if (window.localStorage.getItem('bezier.nib.offered') === null)
            window.localStorage.setItem(
              'bezier.nib.offered',
              JSON.stringify(['design', 'visualize', 'drawings', 'simulation']),
            );
        } catch {
          // Without storage the tip shows; only the tip's own test depends on it.
        }
        const key = 'bezier.preferences';
        let stored: Record<string, unknown> = {};
        try {
          stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
        } catch {
          stored = {};
        }
        const values = (stored.values as Record<string, unknown> | undefined) ?? stored;
        if (values.showHistory === undefined) values.showHistory = true;
        if (values.showReferences === undefined) values.showReferences = true;
        // The app opens on its landing page; most tests start on the projects.
        if (values.startPage === undefined) values.startPage = 'projects';
        // `screenPointOf` assumes the angled view a project opens with; pinned against default
        // changes.
        if (values.openView === undefined) values.openView = 'angled';
        window.localStorage.setItem(key, JSON.stringify(stored.values ? stored : values));
      });
      await use(true);
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];

      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (IGNORED.some((pattern) => pattern.test(text))) return;
        errors.push(text);
      });

      // Uncaught exceptions are collected too.
      page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));

      await use(errors);

      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
