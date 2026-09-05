/**
 * Shared helpers for the route-smoke specs.
 */
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import {
  installApiRoutes,
  type AppScenario,
  type InstalledRoutes,
} from './fixtures'

/**
 * Install the interception table for an app scenario.
 */
export async function installRoutes(
  page: Page,
  scenario: AppScenario
): Promise<InstalledRoutes> {
  return installApiRoutes(page, scenario)
}

/**
 * Fail-closed audit: a request that reached the prefix catch-all layer means
 * the fixture table is missing an endpoint. Attach the list for diagnosis and
 * fail with instructions.
 */
export async function assertNoUnhandledRequests(
  routes: InstalledRoutes,
  testInfo: TestInfo
): Promise<void> {
  if (routes.unhandled.length > 0) {
    await testInfo.attach('unhandled-api-requests', {
      body: routes.unhandled.join('\n'),
      contentType: 'text/plain',
    })
  }

  expect(
    routes.unhandled,
    `Un-intercepted API requests hit the prefix catch-all (they would otherwise ` +
      `receive the SPA's index.html and produce misleading failures). Add ` +
      `specific handlers in tests/route-smoke/fixtures.ts for:\n` +
      routes.unhandled.map(url => `  - ${url}`).join('\n')
  ).toEqual([])
}
