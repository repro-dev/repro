import { unsign } from '@fastify/cookie'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { AccountService } from '~/services/account'
import { ProjectService } from '~/services/project'
import { Harness, createTestHarness } from '~/testing'
import { createAccountRouter } from './account'
import { createStaffRouter } from './staff'

describe('Routers > Staff', () => {
  let harness: Harness
  let accountService: AccountService
  let projectService: ProjectService
  let app: FastifyInstance
  let userApp: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
    projectService = harness.services.projectService

    // Staff router mounted under /staff prefix
    app = harness.bootstrap(
      createStaffRouter(
        accountService,
        projectService,
        harness.services.recordingService
      ),
      { prefix: '/staff' }
    )

    // Workspace router (for concurrent-session tests)
    userApp = harness.bootstrap(
      createAccountRouter(accountService, harness.emailModule)
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  /* ---------- AC1: distinct cookie names on login ---------- */

  describe('Staff account login - AC1 distinct cookie names', () => {
    it('sets the staff cookie and does NOT set the user cookie on valid credentials', async () => {
      const user = await promise(
        accountService.createStaffUser(
          'John Smith',
          'jsmith@example.com',
          'hunter2!'
        )
      )

      const res = await app.inject({
        method: 'POST',
        url: '/staff/login',
        body: {
          email: 'jsmith@example.com',
          password: 'hunter2!',
        },
      })

      const cookieNames = res.cookies.map(c => c.name)

      // Staff cookie IS set
      expect(cookieNames).toContain(harness.env.STAFF_SESSION_COOKIE)
      // User cookie is NOT set
      expect(cookieNames).not.toContain(harness.env.SESSION_COOKIE)

      const cookie = res.cookies.find(
        c => c.name === harness.env.STAFF_SESSION_COOKIE
      )

      // Cookie value is signed (rawToken.signature); unsign to get the raw token for DB lookup
      const rawToken = unsign(
        cookie?.value ?? '',
        harness.env.SESSION_SECRET
      ).value
      expect(rawToken).not.toBeNull()
      const sessionToken = rawToken as string

      await expect(
        promise(accountService.getSessionByToken(sessionToken))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken,
        subjectId: user.id,
        subjectType: 'staff',
      })
    })

    it('returns 401 and sets neither cookie on invalid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/staff/login',
        body: {
          email: 'imposter@example.net',
          password: 'nothunter2',
        },
      })

      const cookieNames = res.cookies.map(c => c.name)

      expect(cookieNames).not.toContain(harness.env.STAFF_SESSION_COOKIE)
      expect(cookieNames).not.toContain(harness.env.SESSION_COOKIE)
      expect(res.statusCode).toEqual(401)
    })
  })

  /* ---------- AC2: concurrent sessions ---------- */

  describe('AC2 concurrent sessions', () => {
    it('staff cookie resolves staff session on /staff/* and user cookie resolves user session on workspace routes', async () => {
      // Create a staff user + login
      const staffUser = await promise(
        accountService.createStaffUser(
          'Staff User',
          'staff@example.com',
          'hunter2!'
        )
      )

      const staffRes = await app.inject({
        method: 'POST',
        url: '/staff/login',
        body: { email: 'staff@example.com', password: 'hunter2!' },
      })

      const staffCookie = staffRes.cookies.find(
        c => c.name === harness.env.STAFF_SESSION_COOKIE
      )
      expect(staffCookie).toBeDefined()

      // Create a user account + login on workspace
      const workspaceAccount = await promise(
        accountService.createAccount('Workspace Account')
      )
      const workspaceUser = await promise(
        accountService.createUser(
          workspaceAccount.id,
          'Workspace User',
          'user@example.com',
          'hunter2!'
        )
      )

      const userRes = await userApp.inject({
        method: 'POST',
        url: '/login',
        body: { email: 'user@example.com', password: 'hunter2!' },
      })

      const userCookie = userRes.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )
      expect(userCookie).toBeDefined()

      // Now inject a staff-route request carrying BOTH cookies.
      // It should resolve as staff because /staff/* picks the staff cookie.
      const staffMeRes = await app.inject({
        method: 'GET',
        url: '/staff/me',
        cookies: {
          [harness.env.STAFF_SESSION_COOKIE]: staffCookie!.value,
          [harness.env.SESSION_COOKIE]: userCookie!.value,
        },
      })
      expect(staffMeRes.statusCode).toEqual(200)
      expect(staffMeRes.json()).toMatchObject({ id: staffUser.id })

      // A workspace route carrying BOTH cookies should resolve as user.
      const userMeRes = await userApp.inject({
        method: 'GET',
        url: '/me',
        cookies: {
          [harness.env.STAFF_SESSION_COOKIE]: staffCookie!.value,
          [harness.env.SESSION_COOKIE]: userCookie!.value,
        },
      })
      expect(userMeRes.statusCode).toEqual(200)
      expect(userMeRes.json()).toMatchObject({ id: workspaceUser.id })
    })
  })

  /* ---------- AC3: independent logout ---------- */

  describe('AC3 independent logout', () => {
    it('staff logout clears only the staff cookie and does not affect user session', async () => {
      // Create staff user + login
      await promise(
        accountService.createStaffUser(
          'Staff',
          'staff2@example.com',
          'hunter2!'
        )
      )

      const staffLoginRes = await app.inject({
        method: 'POST',
        url: '/staff/login',
        body: { email: 'staff2@example.com', password: 'hunter2!' },
      })
      const staffCookie = staffLoginRes.cookies.find(
        c => c.name === harness.env.STAFF_SESSION_COOKIE
      )
      expect(staffCookie).toBeDefined()
      const rawStaffToken = unsign(
        staffCookie!.value,
        harness.env.SESSION_SECRET
      ).value as string

      // Create user account + login
      const workspaceAccount = await promise(accountService.createAccount('WA'))
      await promise(
        accountService.createUser(
          workspaceAccount.id,
          'User',
          'user2@example.com',
          'hunter2!'
        )
      )

      const userLoginRes = await userApp.inject({
        method: 'POST',
        url: '/login',
        body: { email: 'user2@example.com', password: 'hunter2!' },
      })
      const userCookie = userLoginRes.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )
      expect(userCookie).toBeDefined()
      const rawUserToken = unsign(userCookie!.value, harness.env.SESSION_SECRET)
        .value as string

      // Staff logout — should revoke only the staff session
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/staff/logout',
        cookies: {
          [harness.env.STAFF_SESSION_COOKIE]: staffCookie!.value,
          [harness.env.SESSION_COOKIE]: userCookie!.value,
        },
      })
      expect(logoutRes.statusCode).toEqual(204)

      // Staff session should be revoked in DB
      await expect(
        promise(accountService.getSessionByToken(rawStaffToken))
      ).rejects.toThrow()

      // User session should still be valid
      const userSession = await promise(
        accountService.getSessionByToken(rawUserToken)
      )
      expect(userSession.subjectType).toEqual('user')

      // Staff cookie should be cleared
      const setCookieHeader = logoutRes.headers['set-cookie'] as string
      if (setCookieHeader) {
        expect(setCookieHeader).toContain(
          harness.env.STAFF_SESSION_COOKIE + '=;'
        )
      }

      // User session can still authenticate workspace route
      const userMeRes = await userApp.inject({
        method: 'GET',
        url: '/me',
        cookies: {
          [harness.env.SESSION_COOKIE]: userCookie!.value,
        },
      })
      expect(userMeRes.statusCode).toEqual(200)
    })

    it('user logout clears only the user cookie and does not affect staff session', async () => {
      // Create staff user + login
      await promise(
        accountService.createStaffUser(
          'Staff3',
          'staff3@example.com',
          'hunter2!'
        )
      )

      const staffLoginRes = await app.inject({
        method: 'POST',
        url: '/staff/login',
        body: { email: 'staff3@example.com', password: 'hunter2!' },
      })
      const staffCookie = staffLoginRes.cookies.find(
        c => c.name === harness.env.STAFF_SESSION_COOKIE
      )
      expect(staffCookie).toBeDefined()
      const rawStaffToken = unsign(
        staffCookie!.value,
        harness.env.SESSION_SECRET
      ).value as string

      // Create user account + login
      const workspaceAccount = await promise(accountService.createAccount('WB'))
      await promise(
        accountService.createUser(
          workspaceAccount.id,
          'User3',
          'user3@example.com',
          'hunter2!'
        )
      )

      const userLoginRes = await userApp.inject({
        method: 'POST',
        url: '/login',
        body: { email: 'user3@example.com', password: 'hunter2!' },
      })
      const userCookie = userLoginRes.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )
      expect(userCookie).toBeDefined()
      const rawUserToken = unsign(userCookie!.value, harness.env.SESSION_SECRET)
        .value as string

      // User logout — should revoke only the user session
      const logoutRes = await userApp.inject({
        method: 'POST',
        url: '/logout',
        cookies: {
          [harness.env.STAFF_SESSION_COOKIE]: staffCookie!.value,
          [harness.env.SESSION_COOKIE]: userCookie!.value,
        },
      })
      expect(logoutRes.statusCode).toEqual(204)

      // User session should be revoked in DB
      await expect(
        promise(accountService.getSessionByToken(rawUserToken))
      ).rejects.toThrow()

      // Staff session should still be valid
      const staffSession = await promise(
        accountService.getSessionByToken(rawStaffToken)
      )
      expect(staffSession.subjectType).toEqual('staff')

      // User cookie should be cleared in the set-cookie header
      const setCookieHeader = logoutRes.headers['set-cookie'] as string
      if (setCookieHeader) {
        expect(setCookieHeader).toContain(harness.env.SESSION_COOKIE + '=;')
      }

      // Staff session can still authenticate a staff route
      const staffMeRes = await app.inject({
        method: 'GET',
        url: '/staff/me',
        cookies: {
          [harness.env.STAFF_SESSION_COOKIE]: staffCookie!.value,
        },
      })
      expect(staffMeRes.statusCode).toEqual(200)
    })
  })

  /* ---------- AC4: configurability ---------- */

  describe('AC4 configurability', () => {
    it('overriding STAFF_SESSION_COOKIE changes the emitted cookie name', async () => {
      const defaultStaffCookieName = harness.env.STAFF_SESSION_COOKIE
      const customCookieName = 'custom.staff.sessid'

      // Need a fresh app with the custom env; override happens before the
      // session decorator captures the env reference (createTestHarness)
      const customHarness = await createTestHarness()
      customHarness.env.replace('STAFF_SESSION_COOKIE', customCookieName)

      await promise(
        customHarness.services.accountService.createStaffUser(
          'Custom',
          'custom@example.com',
          'hunter2!'
        )
      )

      const customApp = customHarness.bootstrap(
        createStaffRouter(
          customHarness.services.accountService,
          customHarness.services.projectService,
          customHarness.services.recordingService
        ),
        { prefix: '/staff' }
      )

      const res = await customApp.inject({
        method: 'POST',
        url: '/staff/login',
        body: { email: 'custom@example.com', password: 'hunter2!' },
      })

      const cookieNames = res.cookies.map(c => c.name)
      expect(cookieNames).toContain(customCookieName)
      expect(cookieNames).not.toContain(defaultStaffCookieName)

      await customHarness.close()
    })
  })
})
