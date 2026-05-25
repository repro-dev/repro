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
    app = harness.bootstrap(
      createStaffRouter(accountService, harness.services.projectService)
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
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
      const inactiveUser = await promise(
        accountService.createUser(
          (account as Account).id,
          'User Two',
          'user2@example.com',
          'password2'
        )
      )
      await promise(accountService.deactivateUser(inactiveUser.id))

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
      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: inactiveUser.id,
            name: 'User Two',
            active: false,
          }),
        ])
      )
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

    it('should return 400 when the account ID is invalid', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/accounts/not-an-id/users',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(400)
      expect(res.json()).toMatchObject({
        name: 'BadRequestError',
        message: 'Invalid account ID',
      })
    })

    it('should return 400 when the users cursor is invalid', async () => {
      const [staffSession, account] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.AccountA,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${(account as Account).id}/users?cursor=not-an-id`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(400)
      expect(res.json()).toMatchObject({
        name: 'BadRequestError',
        message: 'Invalid account cursor',
      })
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

  describe('GET /users/:userId/projects', () => {
    it('should return project memberships for a user', async () => {
      const [staffSession, user, _project] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.UserA,
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/users/${(user as User).id}/projects`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0]).toMatchObject({
        project: {
          id: expect.any(String),
          name: 'Project A',
        },
        role: 'contributor',
      })
    })

    it('should return empty array when user has no project memberships', async () => {
      const [staffSession, user] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.UserA,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/users/${(user as User).id}/projects`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.items).toHaveLength(0)
    })

    it('should return 403 when not authenticated as staff', async () => {
      const [userSession, user] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
        fixtures.account.UserA,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/users/${(user as User).id}/projects`,
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })
  })
})
