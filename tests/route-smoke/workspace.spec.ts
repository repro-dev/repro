/**
 * Workspace route smoke — encodes REP-1636/1638/1639 expectations against the
 * intercepted stack (see tests/route-smoke/fixtures.ts for the fixture table).
 *
 * Wire-now decisions (test-plan requirement: document each):
 * - Unknown-route not-found: RED today (REP-1636 backlog — workspace has no
 *   `*` catch-all route in apps/workspace/src/index.tsx, so unmatched routes
 *   render a blank document) → annotated `test.fixme`. Flip to an active test
 *   when REP-1636 lands.
 * - Workspace root renders the sessions list: GREEN against the intercepted
 *   stack → active.
 * - App shell persists on the recording detail route: GREEN → active.
 */

import type { Page, TestInfo } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { InstalledRoutes } from './fixtures'
import { smokeFixtures } from './fixtures'
import { assertNoUnhandledRequests, installRoutes } from './helpers'

const WORKSPACE_URL = process.env.WORKSPACE_URL ?? 'http://localhost:7080'

async function withAuditedRoutes(
  page: Page,
  testInfo: TestInfo,
  run: (routes: InstalledRoutes) => Promise<void>
) {
  const routes = await installRoutes(page, 'workspace')
  await run(routes)
  await assertNoUnhandledRequests(routes, testInfo)
}

test.fixme(
  'unknown workspace route renders not-found UI, never a blank document (REP-1636)',
  async ({ page }, testInfo) => {
    await withAuditedRoutes(page, testInfo, async () => {
      await page.goto(`${WORKSPACE_URL}/definitely-not-a-route`)

      // REP-1636: workspace <Routes> has no `*` catch-all, so unmatched paths
      // render nothing. This assertion encodes the intended behavior — flip
      // out of test.fixme when the not-found UI lands.
      const bodyText = (await page.locator('body').innerText()).trim()
      expect(
        bodyText.length,
        'unknown route must render visible not-found text, not a blank document'
      ).toBeGreaterThan(0)
    })
  }
)

test('workspace root renders the sessions list', async ({ page }, testInfo) => {
  await withAuditedRoutes(page, testInfo, async () => {
    await page.goto(WORKSPACE_URL)

    await expect(
      page.getByText(smokeFixtures.recording.title).first()
    ).toBeVisible()
  })
})

test('app shell persists on the workspace recording detail route', async ({
  page,
}, testInfo) => {
  await withAuditedRoutes(page, testInfo, async () => {
    await page.goto(
      `${WORKSPACE_URL}/projects/proj-smoke-1/recordings/rec-smoke-1`
    )

    await expect(page.locator('[aria-label="Main navigation"]')).toBeVisible()
    await expect(page.locator('header').first()).toBeVisible()
  })
})
