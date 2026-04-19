import { Session, StaffUser } from '@repro/domain'
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

  describe('GET /staff-users', () => {
    it('should return list of staff users for admin', async () => {
      const [adminSession] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toHaveProperty('items')
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.items.length).toBeGreaterThanOrEqual(1)
      expect(body.items[0]).toMatchObject({
        type: 'staff',
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
        isAdmin: expect.any(Boolean),
        isActive: expect.any(Boolean),
      })
    })

    it('should return 403 when called by non-admin staff', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should page account results at 50 items with a stable nextCursor', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      await promise(accountService.createAccount('Page Account A'))
      await promise(accountService.createAccount('Page Account B'))
      await promise(accountService.createAccount('Page Account C'))
      for (let n = 0; n < 48; n++) {
        await promise(accountService.createAccount(`Page Account ${n + 4}`))
      }

      const res = await app.inject({
        method: 'GET',
        url: '/accounts',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.items).toHaveLength(50)
      expect(body.nextCursor).toBeDefined()

      const nextPage = await app.inject({
        method: 'GET',
        url: `/accounts?cursor=${body.nextCursor}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(nextPage.statusCode).toEqual(200)
      const nextBody = nextPage.json()
      expect(nextBody.items).toHaveLength(1)
      expect(nextBody.nextCursor).toBeUndefined()
    })

    it('should return 401 when called by unauthenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/staff-users',
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should return 403 when called by regular user session', async () => {
      const [userSession] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })
  })

  describe('POST /staff-users', () => {
    it('should create a new staff user when called by admin', async () => {
      const [adminSession] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
        body: {
          name: 'New Staff User',
          email: 'new-staff@example.com',
          password: 'password123',
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toMatchObject({
        type: 'staff',
        name: 'New Staff User',
        email: 'new-staff@example.com',
        isAdmin: false,
        isActive: true,
      })
    })

    it('should return 403 when called by non-admin staff', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
        body: {
          name: 'New Staff User',
          email: 'new-staff@example.com',
          password: 'password123',
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should validate required fields', async () => {
      const [adminSession] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
        body: {
          name: '',
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should validate email format', async () => {
      const [adminSession] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
        body: {
          name: 'New Staff User',
          email: 'not-an-email',
          password: 'password123',
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should validate minimum password length', async () => {
      const [adminSession] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
        body: {
          name: 'New Staff User',
          email: 'new-staff@example.com',
          password: 'short',
        },
      })

      expect(res.statusCode).toEqual(400)
    })
  })

  describe('GET /staff-users/:staffUserId', () => {
    it('should return staff user details for admin', async () => {
      const [adminSession, staffUser] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
        fixtures.account.StaffUserA,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/staff-users/${(staffUser as StaffUser).id}`,
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toMatchObject({
        type: 'staff',
        id: (staffUser as StaffUser).id,
        name: 'Staff User',
        email: 'staff-user@repro.test',
        isAdmin: false,
        isActive: true,
      })
    })

    it('should return 403 when called by non-admin staff', async () => {
      const [staffSession, staffUser] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.StaffUserAdminA,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/staff-users/${(staffUser as StaffUser).id}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return 404 for nonexistent staff user', async () => {
      const [adminSession] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/staff-users/nonexistent-id',
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(404)
    })
  })

  describe('PATCH /staff-users/:staffUserId', () => {
    it('should update staff user name for admin', async () => {
      const [adminSession, staffUser] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
        fixtures.account.StaffUserA,
      ])

      const res = await app.inject({
        method: 'PATCH',
        url: `/staff-users/${(staffUser as StaffUser).id}`,
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
        body: {
          name: 'Updated Staff Name',
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toMatchObject({
        type: 'staff',
        id: (staffUser as StaffUser).id,
        name: 'Updated Staff Name',
      })
    })

    it('should return 403 when called by non-admin staff', async () => {
      const [staffSession, staffUser] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.StaffUserAdminA,
      ])

      const res = await app.inject({
        method: 'PATCH',
        url: `/staff-users/${(staffUser as StaffUser).id}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
        body: {
          name: 'Updated Staff Name',
        },
      })

      expect(res.statusCode).toEqual(403)
    })
  })

  describe('DELETE /staff-users/:staffUserId', () => {
    it('should deactivate staff user for admin', async () => {
      const [adminSession, staffUser] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
        fixtures.account.StaffUserA,
      ])

      const res = await app.inject({
        method: 'DELETE',
        url: `/staff-users/${(staffUser as StaffUser).id}`,
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toEqual({ ok: true })
    })

    it('should return 403 when called by non-admin staff', async () => {
      const [staffSession, staffUser] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.StaffUserAdminA,
      ])

      const res = await app.inject({
        method: 'DELETE',
        url: `/staff-users/${(staffUser as StaffUser).id}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should show deactivated user in list with isActive: false', async () => {
      const [adminSession] = await harness.loadFixtures([
        fixtures.account.StaffUserAdminA_Session,
      ])

      const newStaff = await promise(
        accountService.createStaffUser(
          'Temp Staff',
          'temp-staff@example.com',
          'password123'
        )
      )
      await promise(accountService.deactivateStaffUser(newStaff.id))

      const res = await app.inject({
        method: 'GET',
        url: '/staff-users',
        headers: {
          authorization: `Bearer ${(adminSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json() as { items: Array<StaffUser> }
      const deactivatedUser = body.items.find(
        item => item.email === 'temp-staff@example.com'
      )
      expect(deactivatedUser).toMatchObject({
        isActive: false,
      })
    })
  })
})
