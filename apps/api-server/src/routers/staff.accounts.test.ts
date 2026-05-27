import { Session } from '@repro/domain'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { sql } from 'kysely'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { AccountService } from '~/services/account'
import { ProjectService } from '~/services/project'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createStaffRouter } from './staff'

describe('Routers > Staff', () => {
  let harness: Harness
  let accountService: AccountService
  let projectService: ProjectService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
    projectService = harness.services.projectService
    app = harness.bootstrap(createStaffRouter(accountService, projectService))
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

      const account = await promise(accountService.createAccount('Account A'))
      const user = await promise(
        accountService.createUser(
          account.id,
          'Account User',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )
      const session = await promise(
        accountService.createSession(user.id, 'user')
      )

      await sql`
        UPDATE sessions
        SET "createdAt" = ${new Date('2026-03-01T00:00:00.000Z')}
        WHERE id = ${decodeId(session.id) as number}
      `.execute(harness.db)

      // Create a second account so pagination/listing still exercises multiple rows.
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
      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: account.id,
            lastActiveAt: '2026-03-01T00:00:00.000Z',
          }),
        ])
      )
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

    it('should pass search and plan filters through the staff account endpoint', async () => {
      const [staffSession, proPlan] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.billing.ProPlan,
      ])
      const account = await promise(
        accountService.createAccount('Searchable Pro')
      )
      await promise(
        accountService.createUser(
          account.id,
          'Search Owner',
          'search-owner@example.com',
          'password1'
        )
      )
      await promise(
        harness.services.billingService.createCheckoutSession(
          account.id,
          'search-owner@example.com',
          proPlan.id
        )
      )

      const res = await app.inject({
        method: 'GET',
        url: '/accounts?search=search-owner%40example.com&planTier=Repro%2B',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0]).toMatchObject({
        id: account.id,
        name: 'Searchable Pro',
        primaryEmail: 'search-owner@example.com',
        planName: 'Repro+',
      })
    })

    it('should accept staff account sort parameters backed by account fields', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])
      const zulu = await promise(accountService.createAccount('000 Zulu Sort'))
      const alpha = await promise(
        accountService.createAccount('000 Alpha Sort')
      )

      const res = await app.inject({
        method: 'GET',
        url: '/accounts?sortBy=name&sortDirection=asc&limit=2',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([
        alpha.id,
        zulu.id,
      ])
    })

    it('should return 400 for an invalid account cursor', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/accounts?cursor=not-an-id',
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
    it('should return staff account details for staff user', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])
      const account = await promise(
        accountService.createAccount('Detail Account')
      )

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${account.id}`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        id: account.id,
        name: 'Detail Account',
        createdAt: expect.any(String),
        lastActiveAt: null,
      })
    })

    it('should return 400 for an invalid account detail ID', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/accounts/not-an-id',
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
  })

  describe('GET /accounts/:accountId/projects', () => {
    it('should return account projects in a list envelope for staff user', async () => {
      const [staffSession, account, project] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.account.AccountA,
        fixtures.project.ProjectA_Multiple_Recordings,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${account.id}/projects`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        items: [
          expect.objectContaining({
            id: project.id,
            name: 'Project A',
            recordingCount: 2,
          }),
        ],
      })
    })

    it('should return 400 for an invalid account projects ID', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/accounts/not-an-id/projects',
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

    it('should return 403 when not authenticated as staff', async () => {
      const [userSession, account] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
        fixtures.account.AccountA,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${account.id}/projects`,
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return 401 when not authenticated', async () => {
      const [account] = await harness.loadFixtures([fixtures.account.AccountA])

      const res = await app.inject({
        method: 'GET',
        url: `/accounts/${account.id}/projects`,
      })

      expect(res.statusCode).toEqual(401)
    })
  })
})
