import { sign } from '@fastify/cookie'
import { PmOAuthProvider } from '@repro/domain'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Env } from '~/config/createEnv'
import { decodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { createPmIntegrationRouter } from './pmIntegrations'

// Stub Linear provider for testing without real network calls
function createStubLinearProvider(): PmOAuthProvider {
  return {
    createAuthorizationURL(state: string, _scopes: string[]): URL {
      const url = new URL('https://linear.app/oauth/authorize')
      url.searchParams.set('state', state)
      url.searchParams.set('scope', _scopes.join(' '))
      return url
    },
    validateAuthorizationCode: async (_code: string) => ({
      accessToken: () => 'stub-linear-access-token',
      hasRefreshToken: () => true,
      refreshToken: () => 'stub-linear-refresh-token',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600_000),
      scopes: () => ['read', 'issues:read'],
    }),
    fetchWorkspaceInfo: async (_accessToken: string) => ({
      id: 'wrkspc-linear-org',
      name: 'Test Linear Org',
    }),
    refreshAccessToken: async (_refreshToken: string) => ({
      accessToken: () => 'stub-refreshed-access-token',
      hasRefreshToken: () => true,
      refreshToken: () => 'stub-refreshed-refresh-token',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600_000),
    }),
  }
}

describe('Routers > PmIntegrations', () => {
  let harness: Harness
  let app: FastifyInstance
  let env: Env
  let sessionCookieValue: string
  let numericAccountId: number

  before(async () => {
    harness = await createTestHarness()
    env = harness.env

    app = harness.bootstrap(
      createPmIntegrationRouter(
        harness.services.accountService,
        harness.services.pmIntegrationService,
        harness.env,
        {
          linear: createStubLinearProvider(),
        }
      )
    )
  })

  beforeEach(async () => {
    await harness.reset()

    // Create an authenticated session for each test
    const account = await promise(
      harness.services.accountService.createAccount('Test Account')
    )
    numericAccountId = decodeId(account.id)!
    const user = await promise(
      harness.services.accountService.createUser(
        account.id,
        'Test User',
        harness.generateRandomEmailAddress(),
        'password123'
      )
    )
    const session = await promise(
      harness.services.accountService.createSession(user.id, 'user')
    )
    sessionCookieValue = sign(session.sessionToken, harness.env.SESSION_SECRET)
  })

  after(async () => {
    await harness.close()
  })

  describe('GET /connections', () => {
    it('should return empty list when no connections exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/connections',
        cookies: { [env.SESSION_COOKIE]: sessionCookieValue },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toEqual({ items: [] })
    })

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/connections',
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should return connected providers without token fields', async () => {
      // Create a connection via the service
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId: numericAccountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-linear-org',
          accessToken: 'should-not-appear',
          refreshToken: 'should-not-appear-either',
          expiresAt: null,
          scopes: ['read', 'issues:read'],
          status: 'connected',
        })
      )

      const res = await app.inject({
        method: 'GET',
        url: '/connections',
        cookies: { [env.SESSION_COOKIE]: sessionCookieValue },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.items).toBeDefined()
      expect(body.items.length).toBe(1)

      const connection = body.items[0]
      expect(connection.provider).toBe('linear')
      expect(connection.providerWorkspaceId).toBe('wrkspc-linear-org')
      expect(connection.status).toBe('connected')
      expect(connection.scopes).toEqual(['read', 'issues:read'])

      // Token non-disclosure: raw token strings must NOT appear in JSON
      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain('should-not-appear')
      expect(serialized).not.toContain('should-not-appear-either')
    })
  })

  describe('GET /oauth/linear', () => {
    it('should redirect to Linear authorization URL', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/linear',
      })

      expect(res.statusCode).toEqual(302)
      const location = res.headers.location as string
      expect(location).toContain('linear.app')
    })

    it('should set a short-lived pm_oauth_state cookie', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/linear',
      })

      const stateCookie = res.cookies.find(c => c.name === 'pm_oauth_state')

      expect(stateCookie).toBeDefined()
      expect(stateCookie!.maxAge).toBe(300)
    })

    it('should return 400 for unsupported provider', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/jira',
      })

      expect(res.statusCode).toEqual(400)
    })
  })

  describe('GET /oauth/linear/callback', () => {
    async function getStateCookie() {
      const initRes = await app.inject({
        method: 'GET',
        url: '/oauth/linear',
      })

      const stateCookie = initRes.cookies.find(
        c => c.name === 'pm_oauth_state'
      )!
      const stateValue = initRes.headers.location
        ? new URL(initRes.headers.location as string).searchParams.get('state')!
        : stateCookie.value

      return { stateCookie, stateValue }
    }

    it('should persist a connection and redirect for authenticated user', async () => {
      const { stateCookie, stateValue } = await getStateCookie()

      const res = await app.inject({
        method: 'GET',
        url: `/oauth/linear/callback?code=valid-code&state=${stateValue}`,
        cookies: {
          [env.SESSION_COOKIE]: sessionCookieValue,
          pm_oauth_state: stateCookie.value,
        },
      })

      expect(res.statusCode).toEqual(302)

      // Verify a connection was persisted
      const listRes = await app.inject({
        method: 'GET',
        url: '/connections',
        cookies: { [env.SESSION_COOKIE]: sessionCookieValue },
      })

      expect(listRes.statusCode).toEqual(200)
      expect(listRes.json().items.length).toBe(1)
      expect(listRes.json().items[0].provider).toBe('linear')
    })

    it('should return 400 when state cookie is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/linear/callback?code=valid-code&state=random-state',
        cookies: { [env.SESSION_COOKIE]: sessionCookieValue },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should return 400 when state does not match cookie', async () => {
      const { stateCookie } = await getStateCookie()

      const res = await app.inject({
        method: 'GET',
        url: '/oauth/linear/callback?code=valid-code&state=tampered-state',
        cookies: {
          [env.SESSION_COOKIE]: sessionCookieValue,
          pm_oauth_state: stateCookie.value,
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should return 400 for unsupported provider callback', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/unknown/callback?code=x&state=y',
        cookies: { [env.SESSION_COOKIE]: sessionCookieValue },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should return 400 when state cookie missing and unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/linear/callback?code=valid-code&state=some-state',
      })

      expect(res.statusCode).toEqual(400)
    })
  })

  describe('POST /connections/:id/disconnect', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/connections/1/disconnect',
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should disconnect a connected provider', async () => {
      // First create a connection
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId: numericAccountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-linear-org',
          accessToken: 'test-token',
          refreshToken: null,
          expiresAt: null,
          scopes: ['read'],
          status: 'connected',
        })
      )

      // List connections to get the encoded id
      const listRes = await app.inject({
        method: 'GET',
        url: '/connections',
        cookies: { [env.SESSION_COOKIE]: sessionCookieValue },
      })

      const connectionId = listRes.json().items[0].id

      // Disconnect
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${connectionId}/disconnect`,
        cookies: { [env.SESSION_COOKIE]: sessionCookieValue },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toEqual({ status: 'disconnected' })
    })

    it('should return 400 for invalid connection id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/connections/invalid-id/disconnect',
        cookies: { [env.SESSION_COOKIE]: sessionCookieValue },
      })

      expect(res.statusCode).toEqual(400)
    })
  })
})
