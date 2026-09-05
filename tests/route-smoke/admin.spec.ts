/**
 * Admin route smoke — encodes REP-1638/1639 expectations against the
 * intercepted stack (see tests/route-smoke/fixtures.ts for the fixture table).
 *
 * Wire-now decisions (test-plan requirement: document each):
 * - Recording detail identity (title in ToolView header + document.title):
 *   GREEN against the intercepted stack (the admin RecordingRoute reads the
 *   seeded /info fixture) → active. The detail route renders outside the
 *   admin Layout by design (its shell is the ToolView header back link).
 *   Flip only if the stack changes shape.
 * - Account detail shows the account name/context: GREEN → active.
 * - Health chip and Health page agree for a degraded fixture: GREEN (both read
 *   the same useHealthStatus fetch) → active. REP-1639's real-world
 *   contradiction involves divergent data sources; this spec pins the
 *   consistency contract so a regression breaks CI.
 * - App shell persists on admin detail routes: GREEN → active.
 */

import type { Page, TestInfo } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { InstalledRoutes } from './fixtures'
import { smokeFixtures } from './fixtures'
import { assertNoUnhandledRequests, installRoutes } from './helpers'

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:7081'

async function withAuditedRoutes(
  page: Page,
  testInfo: TestInfo,
  run: (routes: InstalledRoutes) => Promise<void>
) {
  const routes = await installRoutes(page, 'admin')
  await run(routes)
  await assertNoUnhandledRequests(routes, testInfo)
}

test.describe('recording detail identity (REP-1638)', () => {
  for (const path of [
    `/recordings/${smokeFixtures.recording.id}`,
    `/projects/proj-smoke-1/recordings/${smokeFixtures.recording.id}`,
  ]) {
    test(`shows the recording title and document title on ${path}`, async ({
      page,
    }, testInfo) => {
      await withAuditedRoutes(page, testInfo, async () => {
        await page.goto(`${ADMIN_URL}${path}`)

        // ToolView header renders the seeded title.
        await expect(
          page.getByText(smokeFixtures.recording.title).first()
        ).toBeVisible()

        // RecordingRoute sets document.title from the info payload.
        await expect(page).toHaveTitle(
          `${smokeFixtures.recording.title} - Repro Admin`
        )

        // The recording detail route intentionally renders outside the admin
        // Layout (no sidebar) — its shell is the ToolView header with the
        // back link.
        await expect(page.getByText('Recordings').first()).toBeVisible()
      })
    })
  }
})

test('account detail shows the account name/context (REP-1638)', async ({
  page,
}, testInfo) => {
  await withAuditedRoutes(page, testInfo, async () => {
    await page.goto(`${ADMIN_URL}/accounts/acc-smoke-1`)

    // PageFrame.Title renders the seeded account name.
    await expect(
      page.getByText(smokeFixtures.staffAccount.name).first()
    ).toBeVisible()

    // App shell persists on the detail route.
    await expect(page.locator('[aria-label="Main navigation"]')).toBeVisible()
  })
})

test('health chip and Health page agree for a degraded system (REP-1639)', async ({
  page,
}, testInfo) => {
  await withAuditedRoutes(page, testInfo, async () => {
    // Sidebar health chip (HealthStatusFooter) reads the same /health fixture.
    await page.goto(ADMIN_URL)
    await expect(
      page.getByText('Degraded', { exact: true }).first()
    ).toBeVisible()

    // Health page alert must agree with the chip.
    await page.goto(`${ADMIN_URL}/health`)
    await expect(page.getByText('System status: Degraded')).toBeVisible()
  })
})
