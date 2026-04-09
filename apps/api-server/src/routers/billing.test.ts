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

  describe('GET /subscription', () => {
    it('should return the subscription for an authenticated user', async () => {
      const [subscription, session] = await harness.loadFixtures([
        fixtures.billing.AccountA_ProPlan_Subscription,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/subscription',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        id: subscription.id,
        accountId: subscription.accountId,
        planId: subscription.planId,
        status: 'active',
        currentPeriodStart: expect.any(String),
        currentPeriodEnd: expect.any(String),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    })

    it('should not expose providerSubscriptionId in the response', async () => {
      const [, session] = await harness.loadFixtures([
        fixtures.billing.AccountA_ProPlan_Subscription,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/subscription',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).not.toHaveProperty('providerSubscriptionId')
    })

    it('should return 404 when no subscription exists', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/subscription',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/subscription',
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('GET /entitlements', () => {
    it('should return entitlements as ListResponse for an authenticated user', async () => {
      const [, session] = await harness.loadFixtures([
        fixtures.billing.AccountA_ProPlan_Subscription,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/entitlements',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toHaveProperty('items')
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.items.length).toBeGreaterThan(0)
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/entitlements',
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('POST /change-plan', () => {
    it('should change the plan for an authenticated user', async () => {
      const [, session, freePlan] = await harness.loadFixtures([
        fixtures.billing.AccountA_ProPlan_Subscription,
        fixtures.account.UserA_Session,
        fixtures.billing.FreePlan,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/change-plan',
        body: {
          planId: freePlan.id,
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        planId: freePlan.id,
        status: expect.any(String),
      })
    })

    it('should return 400 when planId is missing', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/change-plan',
        body: {},
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should return 401 when not authenticated', async () => {
      const [proPlan] = await harness.loadFixtures([fixtures.billing.ProPlan])

      const res = await app.inject({
        method: 'POST',
        url: '/change-plan',
        body: {
          planId: proPlan.id,
        },
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('POST /cancel', () => {
    it('should cancel the subscription for an authenticated user', async () => {
      const [, session] = await harness.loadFixtures([
        fixtures.billing.AccountA_ProPlan_Subscription,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/cancel',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        status: expect.any(String),
      })
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/cancel',
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('POST /portal', () => {
    it('should return a portal URL for an authenticated user', async () => {
      const [, session] = await harness.loadFixtures([
        fixtures.billing.AccountA_ProPlan_Subscription,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/portal',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        url: expect.any(String),
      })
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/portal',
      })

      expect(res.statusCode).toEqual(401)
    })
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

    it('should return not-authenticated when no session is active', async () => {
      const [proPlan] = await harness.loadFixtures([fixtures.billing.ProPlan])

      const res = await app.inject({
        method: 'POST',
        url: '/checkout',
        body: {
          planId: proPlan.id,
        },
      })

      expect(res.statusCode).toEqual(401)
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
