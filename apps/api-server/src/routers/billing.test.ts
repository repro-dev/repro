import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { BillingService } from '~/services/billing'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createBillingRouter } from './billing'

describe('Routers > Billing', () => {
  let harness: Harness
  let billingService: BillingService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    billingService = harness.services.billingService
    app = harness.bootstrap(
      createBillingRouter(billingService, harness.services.accountService)
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('POST /checkout', () => {
    it('should create a checkout session for an authenticated user', async () => {
      const [session, proPlan] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
        fixtures.billing.ProPlan,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/checkout',
        body: {
          planId: proPlan.id,
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(201)
      expect(res.json()).toMatchObject({
        transactionId: expect.any(String),
      })
    })

    it('should lazily create a billing customer on first checkout', async () => {
      const [account, session, proPlan] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.account.UserA_Session,
        fixtures.billing.ProPlan,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/checkout',
        body: {
          planId: proPlan.id,
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(201)

      const customer = await promise(
        billingService.getCustomerByAccountId(account.id)
      )

      expect(customer).toMatchObject({
        id: expect.any(String),
        accountId: account.id,
        providerCustomerId: expect.any(String),
      })
    })

    it('should return not-found when plan does not exist', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/checkout',
        body: {
          planId: 'nonexistent-plan-id',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found when no session is active', async () => {
      const [proPlan] = await harness.loadFixtures([fixtures.billing.ProPlan])

      const res = await app.inject({
        method: 'POST',
        url: '/checkout',
        body: {
          planId: proPlan.id,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return 400 when planId is missing', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/checkout',
        body: {},
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(400)
    })
  })
})
