/**
 * End-to-end tests in a real browser, for what Node cannot reach (OPFS, StrictMode boot, camera
 * state). Not part of `pnpm check`, which stays the fast loop.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
  testDir: './e2e',

  // Real OCCT in WebAssembly: a cold load compiles about 5 MB. CI runners are several times slower
  // than a laptop, so they get a longer limit.
  timeout: process.env.CI ? 120_000 : 60_000,
  expect: { timeout: process.env.CI ? 30_000 : 15_000 },

  // No retries: they would hide the intermittent races this suite is meant to catch.
  retries: 0,
  // Playwright's default is half the cores, which is one on a two-core CI runner. Two keep the
  // cores busy while one waits on the browser or the network.
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    // A fixed viewport, so a test can compute where a face lands on screen and not guess at
    // coordinates.
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // The tour (e2e/tour) is how the documentation's pictures are made and not a test of behaviour:
    // it has its own project below and stays out of these.
    { name: 'chromium', testIgnore: '**/tour/**', use: { ...devices['Desktop Chrome'] } },
    /**
     * WebKit stands for Safari and the macOS and Linux webviews (ADR 0005, ADR 0006), and differs
     * most on OPFS and WebAssembly. Opt-in locally with `pnpm e2e:webkit`; CI always runs it.
     */
    ...(process.env.E2E_WEBKIT === '1'
      ? [{ name: 'webkit', testIgnore: '**/tour/**', use: { ...devices['Desktop Safari'] } }]
      : []),
    /**
     * The tour: `TOUR=1 SHOTS_DIR=out SHOTS_OS=macos pnpm exec playwright test --project=tour`.
     * Chromium on every system, at laptop size and density. Playwright's WebKit draws the
     * orientation cube mirrored, which the real webviews do not, so it is not used for pictures.
     */
    ...(process.env.TOUR === '1'
      ? [
          {
            name: 'tour',
            testMatch: '**/tour/**/*.spec.ts',
            use: {
              ...(process.env.TOUR_ENGINE === 'webkit'
                ? devices['Desktop Safari']
                : devices['Desktop Chrome']),
              viewport: { width: 1440, height: 900 },
              deviceScaleFactor: 2,
              colorScheme: 'dark' as const,
            },
          },
        ]
      : []),
  ],

  webServer: {
    // E2E_BUILT runs against the production build, needed for large-model timings: in
    // development React 19 serialises every changed prop into a User Timing mark, and an imported
    // STEP file can be a 241 MB prop.
    command: process.env.E2E_BUILT
      ? `pnpm --filter @bezier/studio exec vite build && pnpm --filter @bezier/studio exec vite preview --port ${PORT} --strictPort`
      : `pnpm --filter @bezier/studio exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.E2E_BUILT ? 600_000 : 120_000,
  },
});
