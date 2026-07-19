import { createExportedKey } from '@repro/encryption'
import expect from 'expect'
import { promise } from 'fluture'
import { createHash } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import * as otpauth from 'otpauth'
import { AccountService } from '~/services/account'
import { TotpService, createTotpService } from '~/services/totpService'
import { Harness, createTestHarness } from '~/testing'
import { createAccountRouter } from './account'

type TotpTestContext = {
  harness: Harness
  accountService: AccountService
  totpService: TotpService
  app: ReturnType<Harness['bootstrap']>
  // User that never has TOTP — for testing plain login
  plainEmail: string
  plainPassword: string
}

async function createTotpTestContext(): Promise<TotpTestContext> {
  const harness = await createTestHarness()
  const accountService = harness.services.accountService
  const encryptionKey = await createExportedKey()
  // env has a replace() method from the Replacer interface (not exposed on Env type)
  ;(harness.env as any).replace('TOTP_ENCRYPTION_KEY', encryptionKey)
  const totpService = createTotpService(harness.db, harness.env)

  const app = harness.bootstrap(async app => {
    await app.register(
      createAccountRouter(accountService, harness.emailModule, totpService)
    )
  })

  await app.ready()

  // Create a user that will never have TOTP enabled
  const plainEmail = harness.generateRandomEmailAddress()
  const plainPassword = 'test-pass-123'
  const account = await promise(accountService.createAccount('TOTP Test'))
  await promise(
    accountService.createUser(
      account.id,
      'Test User',
      plainEmail,
      plainPassword
    )
  )

  return {
    harness,
    accountService,
    totpService,
    app,
    plainEmail,
    plainPassword,
  }
}

function generateTotpCode(secret: string): string {
  return new otpauth.TOTP({
    secret: otpauth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate()
}

async function login(
  app: ReturnType<Harness['bootstrap']>,
  email: string,
  password: string
) {
  return app.inject({
    method: 'POST',
    url: '/login',
    body: { email, password },
  })
}

/**
 * Authenticate and return the signed cookie for subsequent requests.
 */
async function getAuthCookie(
  app: ReturnType<Harness['bootstrap']>,
  email: string,
  password: string,
  sessionCookieName: string
) {
  const res = await login(app, email, password)
  const cookieVal =
    res.cookies.find(c => c.name === sessionCookieName)?.value ?? ''
  return { name: sessionCookieName, value: cookieVal }
}

/**
 * Create a fresh user (with a new account) for TOTP tests.
 * Returns login credentials + a helper to enable TOTP.
 */
async function createTotpUser(
  harness: Harness,
  accountService: AccountService,
  _totpService: TotpService,
  app: ReturnType<Harness['bootstrap']>
) {
  const email = harness.generateRandomEmailAddress()
  const password = 'totp-pass-123'
  const account = await promise(accountService.createAccount('TOTP User Acct'))
  await promise(
    accountService.createUser(account.id, 'TOTP User', email, password)
  )

  const cookie = await getAuthCookie(
    app,
    email,
    password,
    harness.env.SESSION_COOKIE
  )

  let _totpSecret: string | null = null

  async function enableTotp() {
    const setupRes = await app.inject({
      method: 'POST',
      url: '/totp/setup',
      body: { accountLabel: email },
      cookies: { [cookie.name]: cookie.value },
    })
    const secret: string = setupRes.json().secret
    _totpSecret = secret
    const code = generateTotpCode(secret)

    const confirmRes = await app.inject({
      method: 'POST',
      url: '/totp/confirm',
      body: { code },
      cookies: { [cookie.name]: cookie.value },
    })

    return {
      secret,
      backupCodes: confirmRes.json().items as Array<string>,
      cookie,
    }
  }

  async function disableTotp() {
    // If we don't have the secret cached, get it by checking status (TOTP must be enabled)
    // and doing a fresh setup to obtain the secret
    if (_totpSecret == null) {
      // We can't re-setup. Store nothing and just attempt disable with the user's password.
      // If there's no way to get the current TOTP code, this will fail — but
      // the callers have been refactored to call enableTotp first.
      return
    }
    const currentCode = generateTotpCode(_totpSecret)
    await app.inject({
      method: 'POST',
      url: '/totp/disable',
      body: { password, code: currentCode },
      cookies: { [cookie.name]: cookie.value },
    })
  }

  return { email, password, cookie, enableTotp, disableTotp }
}

describe('Routers > Account > TOTP', () => {
  let context: TotpTestContext

  before(async () => {
    context = await createTotpTestContext()
  })

  after(async () => {
    await context.harness.close()
  })

  describe('/login with TOTP disabled (unchanged behavior)', () => {
    it('should return 200 with session cookie when TOTP not enabled', async () => {
      const res = await login(
        context.app,
        context.plainEmail,
        context.plainPassword
      )
      expect(res.statusCode).toEqual(200)
      expect(
        res.cookies.find(c => c.name === context.harness.env.SESSION_COOKIE)
      ).toBeDefined()
    })

    it('should reject wrong password with 401', async () => {
      const res = await login(context.app, context.plainEmail, 'wrong-password')
      expect(res.statusCode).toEqual(401)
    })

    it('should return User object on success', async () => {
      const res = await login(
        context.app,
        context.plainEmail,
        context.plainPassword
      )
      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.type).toEqual('user')
      expect(body.email).toEqual(context.plainEmail)
    })
  })

  describe('/login with TOTP enabled', () => {
    let totpUser: Awaited<ReturnType<typeof createTotpUser>>
    let totpSecret: string

    before(async () => {
      totpUser = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
      const result = await totpUser.enableTotp()
      totpSecret = result.secret
    })

    after(async () => {
      // Clean up TOTP state so other tests are not affected
      // (only matters when tests run in the same process)
      await totpUser.disableTotp()
    })

    it('should return 202 with mfa_pending and no session cookie', async () => {
      const res = await login(context.app, totpUser.email, totpUser.password)
      expect(res.statusCode).toEqual(202)

      const body = res.json()
      expect(body.mfa_pending).toBeTruthy()
      expect(typeof body.mfa_pending).toBe('string')
      expect(body.totpRequired).toBe(true)

      const sessionCookie = res.cookies.find(
        c => c.name === context.harness.env.SESSION_COOKIE
      )
      expect(sessionCookie).toBeUndefined()
    })

    it('should complete login via /totp/verify with valid TOTP code', async () => {
      // Login returns 202 with mfa_pending
      const loginRes = await login(
        context.app,
        totpUser.email,
        totpUser.password
      )
      const { mfa_pending } = loginRes.json()

      // Generate current TOTP code from stored secret
      const currentCode = generateTotpCode(totpSecret)
      const verifyRes = await context.app.inject({
        method: 'POST',
        url: '/totp/verify',
        body: { mfa_pending, code: currentCode, codeType: 'totp' },
      })

      expect(verifyRes.statusCode).toEqual(200)
      expect(verifyRes.json().type).toEqual('user')
      expect(
        verifyRes.cookies.find(
          c => c.name === context.harness.env.SESSION_COOKIE
        )
      ).toBeDefined()
    })

    it('should complete login via /totp/verify with backup code', async () => {
      // Get the backup codes
      const enhanced = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
      const { backupCodes } = await enhanced.enableTotp()

      // Get mfa_pending
      const loginRes = await login(
        context.app,
        enhanced.email,
        enhanced.password
      )
      const { mfa_pending } = loginRes.json()

      // Verify with backup code
      const verifyRes = await context.app.inject({
        method: 'POST',
        url: '/totp/verify',
        body: { mfa_pending, code: backupCodes[0], codeType: 'backup' },
      })
      expect(verifyRes.statusCode).toEqual(200)

      // Backup code consumed — second use fails
      const loginRes2 = await login(
        context.app,
        enhanced.email,
        enhanced.password
      )
      const { mfa_pending: mfa2 } = loginRes2.json()

      const verifyRes2 = await context.app.inject({
        method: 'POST',
        url: '/totp/verify',
        body: { mfa_pending: mfa2, code: backupCodes[0], codeType: 'backup' },
      })
      expect(verifyRes2.statusCode).toEqual(400)
    })
  })

  describe('/totp/verify security', () => {
    let totpUser: Awaited<ReturnType<typeof createTotpUser>>

    before(async () => {
      totpUser = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
    })

    it('should reject expired mfa_pending token', async () => {
      await totpUser.enableTotp()

      // Login to get mfa_pending
      const loginRes = await login(
        context.app,
        totpUser.email,
        totpUser.password
      )
      const { mfa_pending } = loginRes.json()

      // Manually expire via DB
      const tokenHash = createHash('sha256')
        .update(mfa_pending)
        .digest('base64url')

      await context.harness.db
        .updateTable('mfa_pending_tokens' as any)
        .set({ createdAt: new Date(Date.now() - 6 * 60 * 1000) } as any)
        .where('tokenHash', '=', tokenHash)
        .execute()

      const verifyRes = await context.app.inject({
        method: 'POST',
        url: '/totp/verify',
        body: { mfa_pending, code: '123456', codeType: 'totp' },
      })
      expect(verifyRes.statusCode).toEqual(400)
    })

    it('should reject reused (already consumed) mfa_pending token', async () => {
      // Create a fresh user for this test to avoid enableTotp conflicts
      const freshUser = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
      await freshUser.enableTotp()

      const loginRes = await login(
        context.app,
        freshUser.email,
        freshUser.password
      )
      const { mfa_pending } = loginRes.json()

      // First use — will fail on TOTP code but consumes the mfa_pending token
      await context.app.inject({
        method: 'POST',
        url: '/totp/verify',
        body: { mfa_pending, code: '000000', codeType: 'totp' },
      })

      // Second use should be rejected (already consumed)
      const verifyRes2 = await context.app.inject({
        method: 'POST',
        url: '/totp/verify',
        body: { mfa_pending, code: '000000', codeType: 'totp' },
      })
      expect(verifyRes2.statusCode).toEqual(404)
    })
  })

  describe('/totp/setup + /totp/confirm', () => {
    let totpUser: Awaited<ReturnType<typeof createTotpUser>>

    before(async () => {
      totpUser = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
    })

    it('should setup and confirm TOTP for authenticated user', async () => {
      const authCookie = await getAuthCookie(
        context.app,
        totpUser.email,
        totpUser.password,
        context.harness.env.SESSION_COOKIE
      )

      // Setup
      const setupRes = await context.app.inject({
        method: 'POST',
        url: '/totp/setup',
        body: { accountLabel: totpUser.email },
        cookies: { [authCookie.name]: authCookie.value },
      })
      expect(setupRes.statusCode).toEqual(200)

      const setupBody = setupRes.json()
      expect(setupBody.secret).toBeTruthy()
      expect(setupBody.otpauthUri).toContain('otpauth://totp/')
      expect(setupBody.qrDataUrl).toMatch(/^data:image\/png;base64,/)

      // Confirm
      const code = generateTotpCode(setupBody.secret)
      const confirmRes = await context.app.inject({
        method: 'POST',
        url: '/totp/confirm',
        body: { code },
        cookies: { [authCookie.name]: authCookie.value },
      })
      expect(confirmRes.statusCode).toEqual(200)
      const confirmBody = confirmRes.json()
      expect(confirmBody.items).toBeTruthy()
      expect(confirmBody.items).toHaveLength(10)
    })

    it('should reject TOTP setup without authentication', async () => {
      const setupRes = await context.app.inject({
        method: 'POST',
        url: '/totp/setup',
        body: { accountLabel: 'test@example.com' },
      })
      expect(setupRes.statusCode).toEqual(401)
    })

    it('should reject setup when TOTP is already enabled (B3 regression)', async () => {
      const user = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
      const authCookie = await getAuthCookie(
        context.app,
        user.email,
        user.password,
        context.harness.env.SESSION_COOKIE
      )

      // Enable TOTP
      const setupRes = await context.app.inject({
        method: 'POST',
        url: '/totp/setup',
        body: { accountLabel: user.email },
        cookies: { [authCookie.name]: authCookie.value },
      })
      const secret = setupRes.json().secret
      await context.app.inject({
        method: 'POST',
        url: '/totp/confirm',
        body: { code: generateTotpCode(secret) },
        cookies: { [authCookie.name]: authCookie.value },
      })

      // Second setup attempt must fail
      const secondSetup = await context.app.inject({
        method: 'POST',
        url: '/totp/setup',
        body: { accountLabel: user.email },
        cookies: { [authCookie.name]: authCookie.value },
      })
      expect(secondSetup.statusCode).toEqual(409)

      // TOTP should still be enabled (not wiped)
      const statusRes = await context.app.inject({
        method: 'GET',
        url: '/totp/status',
        cookies: { [authCookie.name]: authCookie.value },
      })
      expect(statusRes.json().enabled).toBe(true)
    })

    it('should return backup codes in { items: [...] } envelope (B4)', async () => {
      const user = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
      const authCookie = await getAuthCookie(
        context.app,
        user.email,
        user.password,
        context.harness.env.SESSION_COOKIE
      )

      const setupRes = await context.app.inject({
        method: 'POST',
        url: '/totp/setup',
        body: { accountLabel: user.email },
        cookies: { [authCookie.name]: authCookie.value },
      })
      const code = generateTotpCode(setupRes.json().secret)

      // /totp/confirm should return { items: [...] }
      const confirmRes = await context.app.inject({
        method: 'POST',
        url: '/totp/confirm',
        body: { code },
        cookies: { [authCookie.name]: authCookie.value },
      })
      expect(confirmRes.statusCode).toEqual(200)
      const confirmBody = confirmRes.json()
      expect(confirmBody.items).toBeTruthy()
      expect(Array.isArray(confirmBody.items)).toBe(true)
      expect(confirmBody.backupCodes).toBeUndefined()

      // /totp/regenerate-backup-codes should return { items: [...] }
      const regenRes = await context.app.inject({
        method: 'POST',
        url: '/totp/regenerate-backup-codes',
        cookies: { [authCookie.name]: authCookie.value },
      })
      expect(regenRes.statusCode).toEqual(200)
      const regenBody = regenRes.json()
      expect(regenBody.items).toBeTruthy()
      expect(Array.isArray(regenBody.items)).toBe(true)
    })
  })

  describe('/totp/status', () => {
    let totpUser: Awaited<ReturnType<typeof createTotpUser>>

    before(async () => {
      totpUser = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
    })

    it('should return disabled status initially', async () => {
      const authCookie = await getAuthCookie(
        context.app,
        totpUser.email,
        totpUser.password,
        context.harness.env.SESSION_COOKIE
      )

      const statusRes = await context.app.inject({
        method: 'GET',
        url: '/totp/status',
        cookies: { [authCookie.name]: authCookie.value },
      })
      expect(statusRes.statusCode).toEqual(200)
      expect(statusRes.json()).toEqual({
        enabled: false,
        backupCodesRemaining: 0,
      })
    })
  })

  describe('/totp/disable', () => {
    it('should disable TOTP with password + code', async () => {
      const totpUser = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
      const { secret } = await totpUser.enableTotp()

      // Use the pre-TOTP cookie (still a valid session)
      const currentCode = generateTotpCode(secret)
      const disableRes = await context.app.inject({
        method: 'POST',
        url: '/totp/disable',
        body: { password: totpUser.password, code: currentCode },
        cookies: { [totpUser.cookie.name]: totpUser.cookie.value },
      })
      expect(disableRes.statusCode).toEqual(204)

      // Verify disabled via login (which should now return 200 again)
      const loginRes = await login(
        context.app,
        totpUser.email,
        totpUser.password
      )
      expect(loginRes.statusCode).toEqual(200)
    })

    it('should reject disable without correct password', async () => {
      const totpUser = await createTotpUser(
        context.harness,
        context.accountService,
        context.totpService,
        context.app
      )
      await totpUser.enableTotp()

      const disableRes = await context.app.inject({
        method: 'POST',
        url: '/totp/disable',
        body: { password: 'wrong-password', code: '123456' },
        cookies: { [totpUser.cookie.name]: totpUser.cookie.value },
      })
      expect(disableRes.statusCode).toBeGreaterThanOrEqual(400)
    })
  })
})
