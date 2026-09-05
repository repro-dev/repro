import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright projects (REP-1648):
 *
 * - `route-smoke` — SPA route smoke suite against served production builds
 *   (booted by scripts/route-smoke.sh; requires WORKSPACE_URL/ADMIN_URL env).
 * - `docs-pages`  — Storybook docs-page fragmentation gate against a running
 *   Storybook (requires STORYBOOK_URL env; run by scripts/storybook-gates.sh).
 * - `extension`   — capture-extension runtime verification (local; not part of
 *   the CI gates).
 *
 * The gate projects are chromium-only: CI installs only the chromium browser
 * and the issue scopes the gates to the already-installed browser.
 */
export default defineConfig({
  testDir: './tests',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter: list on CI; local runs also write an HTML report under tmp/. */
  reporter: process.env.CI
    ? [['list']]
    : [
        ['list'],
        ['html', { outputFolder: 'tmp/playwright-report', open: 'never' }],
      ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'route-smoke',
      testMatch: 'tests/route-smoke/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'docs-pages',
      testMatch: 'tests/docs/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'extension',
      testMatch: 'tests/capture-extension.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
