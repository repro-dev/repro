/**
 * Deterministic fixtures + API route interception for the route-smoke suite.
 *
 * Data-only: no DOM access, no rendering — shapes mirror @repro/domain types
 * (User, StaffUser, Project, RecordingInfo, StaffAccountDetail,
 * HealthCheckResult).
 *
 * installApiRoutes registers four layers of handlers. Playwright resolves
 * routes in reverse registration order (last registered wins), so:
 *
 *   1. (first) audit catch-all — records any request that matched no other
 *      handler (documents and static assets pass through unrecorded). The
 *      list is surfaced on failure so missed endpoints are diagnosable.
 *   2. prefix catch-alls for API namespaces — fulfill with a deterministic
 *      empty response. A request reaching this layer is an endpoint the
 *      fixture table does not enumerate; serving it deterministically avoids
 *      the SPA fallback returning index.html as JSON (misleading reds).
 *   3. external hosts (mixpanel/paddle) — aborted so analytics/billing SDKs
 *      never reach the network.
 *   4. (last) specific endpoints with exact fixture payloads.
 *
 * Documents and static assets always pass through to the real server: some
 * API globs (health, recordings, projects) collide with app route paths
 * and asset names.
 *
 * Both apps are served same-origin with an interceptable API base:
 * - workspace: REPRO_API_URL='' (empty string passes the zod env schema and
 *   makes apiClient fetch same-origin relative URLs).
 * - admin: REPRO_API_URL=http://localhost:<admin port> (zod requires a valid
 *   URL; same-origin avoids CORS on intercepted responses).
 */
import type { Page, Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const smokeFixtures = {
  user: {
    type: 'user',
    id: 'user-smoke-1',
    name: 'Smoke User',
    email: 'smoke-user@example.com',
    verified: true,
    admin: true,
  },
  staffUser: {
    type: 'staff',
    id: 'staff-smoke-1',
    name: 'Smoke Staff',
    email: 'smoke-staff@example.com',
    isAdmin: true,
    isActive: true,
  },
  project: {
    id: 'proj-smoke-1',
    name: 'Smoke Project',
  },
  recording: {
    id: 'rec-smoke-1',
    title: 'Smoke Recording',
    url: 'https://recordings.example.com/rec-smoke-1',
    description: '',
    mode: 'Recording',
    duration: 12_000,
    createdAt: '2026-09-01T12:00:00.000Z',
    browserName: 'chromium',
    browserVersion: '1.61.1',
    operatingSystem: 'linux',
    codecVersion: '1.1.0',
  },
  staffAccount: {
    id: 'acc-smoke-1',
    name: 'Smoke Account',
    createdAt: '2026-01-01T00:00:00.000Z',
    active: true,
    primaryEmail: 'smoke-user@example.com',
    planName: 'Repro+',
    subscriptionStatus: 'active',
    recordingCount: 3,
    userCount: 1,
    projectCount: 1,
    lastActiveAt: '2026-09-01T12:00:00.000Z',
    primaryUser: {
      id: 'user-smoke-1',
      name: 'Smoke User',
      email: 'smoke-user@example.com',
      verified: true,
      admin: true,
      active: true,
    },
  },
  staffUserDetail: {
    type: 'user',
    id: 'user-smoke-1',
    name: 'Smoke User',
    email: 'smoke-user@example.com',
    verified: true,
    admin: true,
    active: true,
    accountId: 'acc-smoke-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  health: {
    status: 'degraded',
    timestamp: '2026-09-01T12:00:00.000Z',
    checks: {
      database: { status: 'ok', latencyMs: 2 },
      storage: { status: 'degraded', latencyMs: 900 },
    },
  },
} as const

// ---------------------------------------------------------------------------
// Route interception
// ---------------------------------------------------------------------------

export type AppScenario = 'workspace' | 'admin'

export interface InstalledRoutes {
  /**
   * Live list of URLs that matched no specific fixture handler and fell
   * through to the prefix catch-all layer. Read at the end of a test to
   * surface un-intercepted API endpoints.
   */
  unhandled: string[]
}

/** Namespaces that should always be answered deterministically, never with the SPA fallback. */
const API_PREFIX_HANDLERS: Array<{ glob: string; response: unknown }> = [
  { glob: '**/account/**', response: {} },
  { glob: '**/staff/**', response: {} },
  { glob: '**/projects/**', response: { items: [] } },
  { glob: '**/recordings/**', response: {} },
  { glob: '**/feature-gates/**', response: { items: [] } },
  { glob: '**/health', response: {} },
  { glob: '**/share/**', response: {} },
]

const EXTERNAL_ABORT_GLOBS = [
  '**/*.mixpanel.com/**',
  '**/*.paddle.com/**',
  '**/cdn.paddle.com/**',
  // Avatar images are third-party content; deterministic offline behavior.
  '**/*.gravatar.com/**',
]

function isStaticAsset(url: URL): boolean {
  return /\.(js|mjs|css|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|ico|map|txt|html)$/i.test(
    url.pathname
  )
}

function isDocument(route: Route): boolean {
  return route.request().resourceType() === 'document'
}

/**
 * Documents and static assets must always reach the real server — the API
 * prefix globs collide with app route paths (the health page is served at
 * the same path as the health endpoint) and with asset names. Without this
 * guard the SPA's index document would be "served" as JSON and every
 * navigation would render a blank page.
 *
 * Returns true when the request was passed through to the network.
 */
async function passThrough(route: Route): Promise<boolean> {
  const url = new URL(route.request().url())

  if (isDocument(route) || isStaticAsset(url)) {
    await route.continue()
    return true
  }

  return false
}

async function fulfillJson(route: Route, payload: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  })
}

/**
 * Install the interception table for one app scenario.
 *
 * Returns a live `unhandled` array: URLs that reached the prefix catch-all
 * layer (i.e. endpoints the fixture table does not enumerate). Assert on it at
 * the end of a test to keep the table complete.
 */
export async function installApiRoutes(
  page: Page,
  _scenario: AppScenario
): Promise<InstalledRoutes> {
  const unhandled: string[] = []

  // Layer 1 — audit catch-all. Registered first, so it is checked last: it
  // only sees requests that matched no other handler. Documents and static
  // assets pass through unrecorded; anything else is an un-intercepted
  // API-style request and is recorded before being sent to the network.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())

    if (!isDocument(route) && !isStaticAsset(url)) {
      unhandled.push(route.request().url())
    }

    await route.continue()
  })

  // Layer 2 — prefix catch-alls. Answer API namespaces deterministically so an
  // un-enumerated endpoint never receives the SPA's index.html as JSON.
  for (const prefix of API_PREFIX_HANDLERS) {
    await page.route(prefix.glob, async route => {
      if (await passThrough(route)) {
        return
      }

      unhandled.push(route.request().url())
      await fulfillJson(route, prefix.response)
    })
  }

  // Layer 3 — external hosts never reach the network.
  for (const glob of EXTERNAL_ABORT_GLOBS) {
    await page.route(glob, route => route.abort())
  }

  // Layer 4 — specific endpoints with exact fixture payloads.
  const specific: Array<{ glob: string; response: unknown }> = [
    { glob: '**/account/me', response: smokeFixtures.user },
    { glob: '**/staff/me', response: smokeFixtures.staffUser },
    {
      glob: '**/feature-gates/enabled',
      response: { items: [] },
    },
    { glob: '**/projects', response: { items: [smokeFixtures.project] } },
    { glob: '**/projects/proj-smoke-1', response: smokeFixtures.project },
    {
      // Workspace home fetches the members list for the selected project.
      glob: '**/projects/proj-smoke-1/members',
      response: { items: [] },
    },
    {
      // Admin home lists recent recordings across accounts.
      glob: '**/staff/recordings*',
      response: { items: [] },
    },
    {
      glob: '**/projects/proj-smoke-1/recordings',
      response: { items: [smokeFixtures.recording] },
    },
    {
      glob: '**/recordings/rec-smoke-1/info',
      response: smokeFixtures.recording,
    },
    {
      glob: '**/recordings/rec-smoke-1/resource-map',
      response: {},
    },
    {
      glob: '**/recordings/rec-smoke-1/data',
      response: '',
    },
    { glob: '**/health', response: smokeFixtures.health },
    {
      glob: '**/staff/accounts/acc-smoke-1/users*',
      response: { items: [smokeFixtures.staffUserDetail] },
    },
    {
      glob: '**/staff/accounts/acc-smoke-1/projects',
      response: { items: [] },
    },
    {
      glob: '**/staff/accounts/acc-smoke-1',
      response: smokeFixtures.staffAccount,
    },
  ]

  for (const handler of specific) {
    await page.route(handler.glob, async route => {
      if (isDocument(route)) {
        // Insurance: `/health` (and friends) are both API endpoints and app
        // page routes — a document navigation must reach the real server.
        await route.continue()
        return
      }

      await fulfillJson(route, handler.response)
    })
  }

  return { unhandled }
}
