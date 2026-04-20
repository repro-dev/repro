import { Session } from '@repro/domain'
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
})
