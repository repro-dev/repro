import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { sql } from 'kysely'
import { after, before, beforeEach, describe, it, mock } from 'node:test'
import { Env, createEnv } from '~/config/createEnv'
import { createSessionDecorator } from '~/decorators/session'
import { createStubPaddleClient } from '~/modules/billing'
import { decodeId } from '~/modules/database'
import { createEmailModule } from '~/modules/email'
import { createAccountRouter } from '~/routers/account'
import { createAccountService } from '~/services/account'
import { ApiKeyService, createApiKeyService } from '~/services/apiKeys'
import { createBillingService } from '~/services/billing'
import { type TransactionalEmailService } from '~/services/transactionalEmail'
import { setUpTestDatabase } from '~/testing/database'
import { createCapturedSendEmail } from '~/testing/email'
import { setUpTestFileSystemStorage } from '~/testing/storage'
import { fromRouter } from '~/testing/utils'

// Stand-alone harness that wires ApiKeyService into the session decorator so we
// can exercise the Bearer token / API key code paths that the default test
// harness (which omits apiKeyService) cannot reach.
async function createApiKeyHarness() {
  const env: Env = createEnv()
  const { db, close: closeDb } = await setUpTestDatabase()
  const { close: closeStorage } = await setUpTestFileSystemStorage()

  const sendEmail = createCapturedSendEmail([])
  const emailModule = createEmailModule({ sendEmail })
  const stubPaddleClient = createStubPaddleClient(db)
  const billingService = createBillingService(db, env, stubPaddleClient)
  const noopTransactionalEmailService: TransactionalEmailService = {
    enqueue: () => {},
  }
  const accountService = createAccountService(
    db,
    emailModule,
    noopTransactionalEmailService,
    billingService
  )
  const apiKeyService: ApiKeyService = createApiKeyService(db)

  // Session decorator wired with apiKeyService — enables Bearer/API-key auth path
  const sessionDecorator = createSessionDecorator(
    accountService,
    env,
    apiKeyService
  )

  function bootstrap() {
    return fromRouter(
      createAccountRouter(
        accountService,
        emailModule,
        noopTransactionalEmailService
      ),
      [sessionDecorator]
    )
  }

  async function reset() {
    await sql`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()) LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.table_name) || ' CASCADE';
        END LOOP;
      END $$;
    `.execute(db)
  }

  async function close() {
    await closeDb()
    await closeStorage()
  }

  return { env, db, accountService, apiKeyService, bootstrap, reset, close }
}

describe('Decorators > Session — Bearer token / API key auth', () => {
  let harness: Awaited<ReturnType<typeof createApiKeyHarness>>
  let app: FastifyInstance

  before(async () => {
    harness = await createApiKeyHarness()
    app = harness.bootstrap()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  // Helper: create an account + user + API key, return the raw key string
  async function createUserWithApiKey() {
    const account = await promise(
      harness.accountService.createAccount('Test Account')
    )
    const user = await promise(
      harness.accountService.createUser(
        account.id,
        'Test User',
        'test@example.com',
        'hunter2!'
      )
    )

    const userId = decodeId(user.id)
    const accountId = decodeId(account.id)

    if (userId == null || accountId == null) {
      throw new Error('Could not decode user or account ID')
    }

    const apiKey = await promise(
      harness.apiKeyService.createApiKey({
        userId,
        accountId,
        name: 'Test Key',
        scopes: ['read'],
      })
    )

    return { user, apiKey }
  }

  async function createUserSession(createdAt?: Date) {
    const account = await promise(
      harness.accountService.createAccount('Session Account')
    )
    const user = await promise(
      harness.accountService.createUser(
        account.id,
        'Session User',
        harness.env.SESSION_COOKIE + '@example.com',
        'hunter2!'
      )
    )
    const session = await promise(
      harness.accountService.createSession(user.id, 'user')
    )

    if (createdAt != null) {
      await sql`
        UPDATE sessions
        SET "createdAt" = ${createdAt}
        WHERE id = ${decodeId(session.id) as number}
      `.execute(harness.db)
    }

    return session
  }

  async function createStaffSession(createdAt?: Date) {
    const staffUser = await promise(
      harness.accountService.createStaffUser(
        'Session Staff',
        'staff-' + harness.env.SESSION_COOKIE + '@example.com',
        'hunter2!'
      )
    )
    const session = await promise(
      harness.accountService.createSession(staffUser.id, 'staff')
    )

    if (createdAt != null) {
      await sql`
        UPDATE sessions
        SET "createdAt" = ${createdAt}
        WHERE id = ${decodeId(session.id) as number}
      `.execute(harness.db)
    }

    return session
  }

  function getSessionCookieExpires(
    res: Awaited<ReturnType<typeof app.inject>>
  ) {
    const sessionCookie = res.cookies.find(
      c => c.name === harness.env.SESSION_COOKIE
    )

    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.expires).toBeDefined()

    return new Date(sessionCookie?.expires as string | Date)
  }

  // Bug 1 — getCurrentUser() should work for API key auth (was: 404 because
  // getSessionByToken was called for synthetic sessions with no DB row)
  describe('Bug 1: getCurrentUser() via valid API key Bearer token', () => {
    it('should return 200 with the user object when using a valid API key as Bearer token', async () => {
      const { user, apiKey } = await createUserWithApiKey()

      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          authorization: `Bearer ${apiKey.key}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        id: user.id,
        name: 'Test User',
      })
    })
  })

  // Bug 2 — Raw API key must NOT appear in Set-Cookie response header
  // (was: the onSend hook unconditionally set the cookie for any non-null session)
  describe('Bug 2: No Set-Cookie header for API key Bearer auth', () => {
    it('should not set a session cookie when authenticating via Bearer API key', async () => {
      const { apiKey } = await createUserWithApiKey()

      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          authorization: `Bearer ${apiKey.key}`,
        },
      })

      expect(res.statusCode).toEqual(200)

      const cookieNames = res.cookies.map(c => c.name)
      expect(cookieNames).not.toContain(harness.env.SESSION_COOKIE)
    })

    it('should not leak the raw API key value into any response header', async () => {
      const { apiKey } = await createUserWithApiKey()

      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          authorization: `Bearer ${apiKey.key}`,
        },
      })

      const rawHeaders = JSON.stringify(res.headers)
      expect(rawHeaders).not.toContain(apiKey.key)
    })
  })

  // Bug 3 — Invalid Bearer token must return 401, not 404
  // (was: req.session was null but some guards called reject(notFound()))
  describe('Bug 3: Invalid Bearer token returns 401 Not Authenticated', () => {
    it('should return 401 when an unrecognised Bearer token is supplied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          authorization: 'Bearer repro_thisisnotavalidkey',
        },
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should return 401 for a completely garbage Bearer token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          authorization: 'Bearer garbage_token_123',
        },
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should return 401 when no auth is provided at all', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/me',
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('Subject-specific session cookie expiry', () => {
    it('sets a user cookie from the 30 day soft expiry when below the 90 day hard cap', async () => {
      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const session = await createUserSession(fixedNow)

        const res = await app.inject({
          method: 'GET',
          url: '/me',
          cookies: {
            [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
          },
        })

        expect(res.statusCode).toEqual(200)
        expect(getSessionCookieExpires(res).getTime()).toEqual(
          fixedNow.getTime() + 30 * 24 * 3600 * 1000
        )
      } finally {
        mock.timers.reset()
      }
    })

    it('caps a user cookie at the 90 day hard expiry', async () => {
      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const createdAt = new Date(fixedNow.getTime() - 70 * 24 * 3600 * 1000)
        const session = await createUserSession(createdAt)

        const res = await app.inject({
          method: 'GET',
          url: '/me',
          cookies: {
            [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
          },
        })

        expect(res.statusCode).toEqual(200)
        expect(getSessionCookieExpires(res).getTime()).toEqual(
          createdAt.getTime() + 90 * 24 * 3600 * 1000
        )
      } finally {
        mock.timers.reset()
      }
    })

    it('sets a staff cookie from the 12 hour soft expiry when below the 7 day hard cap', async () => {
      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const session = await createStaffSession(fixedNow)

        const res = await app.inject({
          method: 'GET',
          url: '/me',
          cookies: {
            [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
          },
        })

        expect(res.statusCode).toEqual(200)
        expect(getSessionCookieExpires(res).getTime()).toEqual(
          fixedNow.getTime() + 12 * 3600 * 1000
        )
      } finally {
        mock.timers.reset()
      }
    })

    it('caps a staff cookie at the 7 day hard expiry', async () => {
      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const createdAt = new Date(fixedNow.getTime() - 6.75 * 24 * 3600 * 1000)
        const session = await createStaffSession(createdAt)

        const res = await app.inject({
          method: 'GET',
          url: '/me',
          cookies: {
            [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
          },
        })

        expect(res.statusCode).toEqual(200)
        expect(getSessionCookieExpires(res).getTime()).toEqual(
          createdAt.getTime() + 7 * 24 * 3600 * 1000
        )
      } finally {
        mock.timers.reset()
      }
    })
  })
})
