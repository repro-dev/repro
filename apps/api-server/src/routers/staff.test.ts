import { unsign } from '@fastify/cookie'
import { Account, Session, User } from '@repro/domain'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { AccountService } from '~/services/account'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createStaffRouter } from './staff'

describe('Routers > Staff', () => {
  let harness: Harness
  let accountService: AccountService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
    app = harness.bootstrap(createStaffRouter(accountService))
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('Staff account login', () => {
    it('should create a new session when logging in with valid credentials', async () => {
      const user = await promise(
        accountService.createStaffUser(
          'John Smith',
          'jsmith@example.com',
          'hunter2!'
        )
      )

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: 'jsmith@example.com',
          password: 'hunter2!',
        },
      })

      const cookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
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

    it('should return not-authenticated when logging in with invalid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: 'imposter@example.net',
          password: 'nothunter2',
        },
      })

      const cookieNames = res.cookies.map(c => c.name)

      expect(cookieNames).not.toContain(harness.env.SESSION_COOKIE)
      expect(res.statusCode).toEqual(401)
    })
  })

  describe('GET /accounts', () => {
    it('should return list of accounts for staff user', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      // Create some accounts
      await promise(accountService.createAccount('Account A'))
      await promise(accountService.createAccount('Account B'))

      const res = await app.inject({
        method: 'GET',
        url: '/accounts',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toHaveProperty('items')
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.items.length).toBeGreaterThanOrEqual(2)
    })

    it('should respect limit and return nextCursor when more results exist', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      await promise(accountService.createAccount('Page Account A'))
      await promise(accountService.createAccount('Page Account B'))
      await promise(accountService.createAccount('Page Account C'))

      const res = await app.inject({
        method: 'GET',
        url: '/accounts?limit=2',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.items).toHaveLength(2)
      expect(body.nextCursor).toBeDefined()
    })

    it('should return all results and no nextCursor when results fit within limit', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      await promise(accountService.createAccount('Only Account'))

      const res = await app.inject({
        method: 'GET',
        url: '/accounts?limit=50',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.nextCursor).toBeUndefined()
    })

    it('should return 403 when not authenticated as staff', async () => {
      const [userSession] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/accounts',
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/accounts',
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('GET /accounts/:accountId', () => {
    it('should return account details for staff user', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const account = await promise(
        accountService.createAccount('Test Account')
      )

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${account.id}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toMatchObject({
        id: account.id,
        name: 'Test Account',
      })
    })

    it('should return 403 when not authenticated as staff', async () => {
      const [userSession, account] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
        fixtures.account.AccountB,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${(account as Account).id}`,
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })
  })

  describe('GET /accounts/:accountId/users', () => {
    it('should return list of users in account for staff user', async () => {
      const [staffSession, account] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.AccountA,
      ])

      // Create some users in the account
      await promise(
        accountService.createUser(
          (account as Account).id,
          'User One',
          'user1@example.com',
          'password1'
        )
      )
      await promise(
        accountService.createUser(
          (account as Account).id,
          'User Two',
          'user2@example.com',
          'password2'
        )
      )

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${(account as Account).id}/users`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toHaveProperty('items')
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.items).toHaveLength(2)
      expect(body.items[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
      })
    })

    it('should respect limit and return nextCursor when more users exist', async () => {
      const [staffSession, account] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.AccountA,
      ])

      await promise(
        accountService.createUser(
          (account as Account).id,
          'User One',
          'userpag1@example.com',
          'password1'
        )
      )
      await promise(
        accountService.createUser(
          (account as Account).id,
          'User Two',
          'userpag2@example.com',
          'password2'
        )
      )
      await promise(
        accountService.createUser(
          (account as Account).id,
          'User Three',
          'userpag3@example.com',
          'password3'
        )
      )

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${(account as Account).id}/users?limit=2`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.items).toHaveLength(2)
      expect(body.nextCursor).toBeDefined()
    })

    it('should return 403 when not authenticated as staff', async () => {
      const [userSession, account] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
        fixtures.account.AccountA,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${(account as Account).id}/users`,
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })
  })

  describe('GET /users/:userId', () => {
    it('should return user details for staff user', async () => {
      const [staffSession, user] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.UserA,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/users/${(user as User).id}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toMatchObject({
        id: (user as User).id,
        name: 'User A',
        email: 'user-a@example.com',
      })
    })

    it('should return 403 when not authenticated as staff', async () => {
      const [userSession, targetUser] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
        fixtures.account.UserB,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/users/${(targetUser as User).id}`,
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })
  })

  describe('PATCH /users/:userId', () => {
    it('should toggle admin status for staff user', async () => {
      const [staffSession, user] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.UserA,
      ])

      const res = await app.inject({
        method: 'PATCH',
        url: `/users/${(user as User).id}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
        body: {
          isAdmin: true,
        },
      })

      expect(res.statusCode).toEqual(200)

      // Verify admin was toggled
      const isAdmin = await promise(
        accountService.getUserIsAdmin((user as User).id)
      )
      expect(isAdmin).toBe(true)
    })

    it('should deactivate user for staff user', async () => {
      const [staffSession, user] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.UserA,
      ])

      const res = await app.inject({
        method: 'PATCH',
        url: `/users/${(user as User).id}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
        body: {
          isActive: false,
        },
      })

      expect(res.statusCode).toEqual(200)

      // Response should be the user snapshot taken before deactivation
      const body = res.json()
      expect(body).toMatchObject({
        id: (user as User).id,
        name: 'User A',
      })

      // Verify user was deactivated (getUserById will fail since user is inactive)
      await expect(
        promise(accountService.getUserById((user as User).id))
      ).rejects.toMatchObject({
        message: expect.any(String),
      })
    })

    it('should return 403 when not authenticated as staff', async () => {
      const [userSession, targetUser] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
        fixtures.account.UserB,
      ])

      const res = await app.inject({
        method: 'PATCH',
        url: `/users/${(targetUser as User).id}`,
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
        body: {
          isAdmin: true,
        },
      })

      expect(res.statusCode).toEqual(403)
    })
  })
})
