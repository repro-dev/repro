import { Session, StaffUser } from '@repro/domain'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createStaffOAuthRouter } from './staffOAuth'

// Stub Google provider for testing without real network calls
function createStubGoogleProvider(
  options: {
    email?: string
    sub?: string
    name?: string
  } = {}
) {
  const email = options.email ?? 'staff@repro.dev'
  const sub = options.sub ?? 'google-staff-sub-123'
  const name = options.name ?? 'Staff Member'

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
      sub,
      email,
      name,
    }),
  }
}

describe('Routers > StaffOAuth', () => {
  let harness: Harness
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()

    app = harness.bootstrap(
      createStaffOAuthRouter(harness.services.accountService, harness.env, {
        google: createStubGoogleProvider() as any,
      })
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

    it('should set short-lived oauth_state and oauth_code_verifier cookies', async () => {
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
      // Short-lived max-age for redirect round-trip only
      expect(stateCookie?.maxAge).toBeLessThanOrEqual(300)
      expect(verifierCookie?.maxAge).toBeLessThanOrEqual(300)
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

    it('should create a staff session for a @repro.dev account', async () => {
      // Pre-create the staff user in the database
      await promise(
        harness.services.accountService.createStaffUser(
          'Staff Member',
          'staff@repro.dev',
          'password'
        )
      )

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

      // Should redirect to admin app with a staff session
      expect(res.statusCode).toEqual(302)
      const sessionCookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )
      expect(sessionCookie).toBeDefined()
    })

    it('should reject non-@repro.dev accounts with a redirect to login with error', async () => {
      // Use an app with a non-@repro.dev Google account
      const outsideApp = harness.bootstrap(
        createStaffOAuthRouter(harness.services.accountService, harness.env, {
          google: createStubGoogleProvider({
            email: 'attacker@gmail.com',
          }) as any,
        })
      )

      const initRes = await outsideApp.inject({
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

      const res = await outsideApp.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=valid-code&state=${stateValue}`,
        cookies: {
          oauth_state: stateCookie.value,
          oauth_code_verifier: verifierCookie.value,
        },
      })

      // Should redirect to login with an error param (not set a session cookie)
      expect(res.statusCode).toEqual(302)
      const location = res.headers.location as string
      expect(location).toContain('error=')

      // Must not have set a session cookie
      const sessionCookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )
      expect(sessionCookie).toBeUndefined()
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

    it('should create a new staff user on first login with @repro.dev account', async () => {
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

      // Should redirect to admin app
      expect(res.statusCode).toEqual(302)

      // Session cookie should be set
      const sessionCookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )
      expect(sessionCookie).toBeDefined()

      // Verify the session is for a staff user
      const session = (await promise(
        harness.services.accountService.getSessionByToken(sessionCookie!.value)
      )) as Session
      expect(session.subjectType).toEqual('staff')
    })

    it('should log in an existing staff user on subsequent visits', async () => {
      // Pre-create the staff user
      const staffUser = (await promise(
        harness.services.accountService.createStaffUser(
          'Staff Member',
          'staff@repro.dev',
          'password'
        )
      )) as StaffUser

      // First login
      const first = await getStateCookies()
      await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=valid-code&state=${first.stateValue}`,
        cookies: {
          oauth_state: first.stateCookie.value,
          oauth_code_verifier: first.verifierCookie.value,
        },
      })

      // Second login — same staff user should be found, not a new one
      const second = await getStateCookies()
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

      const session = (await promise(
        harness.services.accountService.getSessionByToken(sessionCookie!.value)
      )) as Session
      // Must be the same staff user
      expect(session.subjectId).toEqual(staffUser.id)
    })
  })

  describe('POST /logout', () => {
    it('should clear the session cookie on logout', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/logout',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(204)
    })
  })
})
