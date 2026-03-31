import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness } from '~/testing'
import { createSocialAuthRouter } from './socialAuth'

// Stub Google provider for testing without real network calls
function createStubGoogleProvider() {
  return {
    createAuthorizationURL(state: string, _codeVerifier: string): URL {
      const url = new URL('https://accounts.google.com/o/oauth2/auth')
      url.searchParams.set('state', state)
      url.searchParams.set('code_challenge', 'stub')
      return url
    },
    validateAuthorizationCode: async (
      _code: string,
      _codeVerifier: string
    ) => ({
      accessToken: () => 'stub-access-token',
      hasRefreshToken: () => false,
      refreshToken: () => '',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600_000),
    }),
    fetchUserInfo: async (_accessToken: string) => ({
      sub: 'google-sub-123',
      email: 'google-user@example.com',
      name: 'Google User',
    }),
  }
}

describe('Routers > SocialAuth', () => {
  let harness: Harness
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()

    app = harness.bootstrap(
      createSocialAuthRouter(
        harness.services.accountService,
        harness.services.socialAuthService,
        harness.env,
        {
          google: createStubGoogleProvider() as any,
        }
      )
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('GET /oauth/google', () => {
    it('should redirect to Google authorization URL', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/google',
      })

      expect(res.statusCode).toEqual(302)
      const location = res.headers.location as string
      expect(location).toContain('accounts.google.com')
    })

    it('should set a short-lived oauth_state cookie', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/google',
      })

      const stateCookie = res.cookies.find(c => c.name === 'oauth_state')
      const verifierCookie = res.cookies.find(
        c => c.name === 'oauth_code_verifier'
      )

      expect(stateCookie).toBeDefined()
      expect(verifierCookie).toBeDefined()
    })

    it('should return 400 for unsupported provider', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/unknown-provider',
      })

      expect(res.statusCode).toEqual(400)
    })
  })

  describe('GET /oauth/google/callback', () => {
    async function getStateCookies() {
      const initRes = await app.inject({
        method: 'GET',
        url: '/oauth/google',
      })

      const stateCookie = initRes.cookies.find(c => c.name === 'oauth_state')!
      const verifierCookie = initRes.cookies.find(
        c => c.name === 'oauth_code_verifier'
      )!
      const stateValue = initRes.headers.location
        ? new URL(initRes.headers.location as string).searchParams.get('state')!
        : stateCookie.value

      return { stateCookie, verifierCookie, stateValue }
    }

    it('should create a new user and session for a new Google account', async () => {
      const { stateCookie, verifierCookie, stateValue } =
        await getStateCookies()

      const res = await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=valid-code&state=${stateValue}`,
        cookies: {
          oauth_state: stateCookie.value,
          oauth_code_verifier: verifierCookie.value,
        },
      })

      // Should redirect to app with session
      expect(res.statusCode).toEqual(302)
      const sessionCookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )
      expect(sessionCookie).toBeDefined()
    })

    it('should create a session for a returning OAuth user', async () => {
      const { stateCookie, verifierCookie, stateValue } =
        await getStateCookies()

      // First login — creates user + connection
      await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=valid-code&state=${stateValue}`,
        cookies: {
          oauth_state: stateCookie.value,
          oauth_code_verifier: verifierCookie.value,
        },
      })

      // Get fresh state for second login
      const second = await getStateCookies()

      // Second login — should find existing connection
      const res = await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=valid-code&state=${second.stateValue}`,
        cookies: {
          oauth_state: second.stateCookie.value,
          oauth_code_verifier: second.verifierCookie.value,
        },
      })

      expect(res.statusCode).toEqual(302)
      const sessionCookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )
      expect(sessionCookie).toBeDefined()
    })

    it('should return 400 when state cookie is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/google/callback?code=valid-code&state=random-state',
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should return 400 when state does not match cookie', async () => {
      const { stateCookie, verifierCookie } = await getStateCookies()

      const res = await app.inject({
        method: 'GET',
        url: '/oauth/google/callback?code=valid-code&state=tampered-state',
        cookies: {
          oauth_state: stateCookie.value,
          oauth_code_verifier: verifierCookie.value,
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should return 400 for unsupported provider callback', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/bad-provider/callback?code=x&state=y',
      })

      expect(res.statusCode).toEqual(400)
    })
  })
})
