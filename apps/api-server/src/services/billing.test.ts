import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { notFound } from '~/utils/errors'
import { BillingService } from './billing'

describe('Services > Billing (dev adapter)', () => {
  let harness: Harness
  let billingService: BillingService

  before(async () => {
    harness = await createTestHarness()
    billingService = harness.services.billingService
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('getOrCreateCustomer', () => {
    it('should create a new billing customer for an account', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
      ])

      const customer = await promise(
        billingService.getOrCreateCustomer(account.id, 'billing-a@repro.test')
      )

      expect(customer).toMatchObject({
        id: expect.any(String),
        accountId: account.id,
        providerCustomerId: expect.any(String),
        createdAt: expect.any(Date),
      })
    })

    it('should return existing customer on repeated calls', async () => {
      const [customer] = await harness.loadFixtures([
        fixtures.billing.CustomerA,
      ])

      const second = await promise(
        billingService.getOrCreateCustomer(
          customer.accountId,
          'billing-a@repro.test'
        )
      )

      expect(customer.id).toBe(second.id)
      expect(customer.providerCustomerId).toBe(second.providerCustomerId)
    })
  })

  describe('listPlans', () => {
    it('should list active plans', async () => {
      await harness.loadFixtures([
        fixtures.billing.FreePlan,
        fixtures.billing.ProPlan,
      ])

      const plans = await promise(billingService.listPlans())

      expect(plans).toHaveLength(2)
      expect(plans.map(p => p.name)).toEqual(
        expect.arrayContaining(['free', 'pro'])
      )
    })
  })

  describe('getPlanById', () => {
    it('should return a plan by ID', async () => {
      const [freePlan] = await harness.loadFixtures([
        fixtures.billing.FreePlan,
      ])

      const plan = await promise(billingService.getPlanById(freePlan.id))

      expect(plan).toMatchObject({
        id: freePlan.id,
        name: 'free',
      })
    })

    it('should throw not-found for invalid plan ID', async () => {
      await expect(
        promise(billingService.getPlanById('invalid-id'))
      ).rejects.toThrow(notFound())
    })
  })

  describe('createCheckoutSession', () => {
    it('should create a checkout session and subscription', async () => {
      const [account, freePlan] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.FreePlan,
      ])

      const result = await promise(
        billingService.createCheckoutSession(
          account.id,
          'checkout@repro.test',
          freePlan.id
        )
      )

      expect(result).toMatchObject({
        transactionId: expect.any(String),
      })

      const subscription = await promise(
        billingService.getSubscriptionByAccountId(account.id)
      )

      expect(subscription).toMatchObject({
        accountId: account.id,
        status: 'active',
        planId: freePlan.id,
      })
    })
  })

  describe('getSubscriptionByAccountId', () => {
    it('should throw not-found when no subscription exists', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
      ])

      await expect(
        promise(billingService.getSubscriptionByAccountId(account.id))
      ).rejects.toThrow(notFound())
    })

    it('should return subscription from fixture', async () => {
      const [subscription, account] = await harness.loadFixtures([
        fixtures.billing.AccountA_FreePlan_Subscription,
        fixtures.account.AccountA,
      ])

      expect(subscription).toMatchObject({
        accountId: account.id,
        status: 'active',
      })
    })
  })

  describe('changePlan', () => {
    it('should change the subscription plan', async () => {
      const [account, , proPlan] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_FreePlan_Checkout,
        fixtures.billing.ProPlan,
      ])

      const updated = await promise(
        billingService.changePlan(account.id, proPlan.id)
      )

      expect(updated.planId).toBe(proPlan.id)
    })
  })

  describe('cancelSubscription', () => {
    it('should mark subscription for cancellation at period end', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_FreePlan_Checkout,
      ])

      const canceled = await promise(
        billingService.cancelSubscription(account.id)
      )

      expect(canceled.cancelAtPeriodEnd).toBe(true)
    })
  })

  describe('getEntitlements', () => {
    it('should return entitlements for the subscription plan', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_ProPlan_Checkout,
      ])

      const entitlements = await promise(
        billingService.getEntitlements(account.id)
      )

      expect(entitlements).toHaveLength(2)
      expect(entitlements).toEqual(
        expect.arrayContaining([
          { feature: 'recordings', enabled: true, limit: null },
          { feature: 'projects', enabled: true, limit: null },
        ])
      )
    })

    it('should return limited entitlements for free plan', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_FreePlan_Checkout,
      ])

      const entitlements = await promise(
        billingService.getEntitlements(account.id)
      )

      expect(entitlements).toEqual(
        expect.arrayContaining([
          { feature: 'recordings', enabled: true, limit: 10 },
          { feature: 'projects', enabled: true, limit: 1 },
        ])
      )
    })
  })

  describe('getPortalLink', () => {
    it('should return a portal URL', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_FreePlan_Checkout,
      ])

      const portal = await promise(billingService.getPortalLink(account.id))

      expect(portal).toMatchObject({
        url: expect.any(String),
      })
    })
  })

  describe('recordWebhookEvent', () => {
    it('should record a new webhook event', async () => {
      const result = await promise(
        billingService.recordWebhookEvent(
          'evt_001',
          'subscription.created',
          '{}'
        )
      )

      expect(result).toMatchObject({
        id: expect.any(String),
        alreadyProcessed: false,
      })
    })
  })

  describe('markWebhookEventProcessed', () => {
    it('should mark a webhook event as processed', async () => {
      const event = await promise(
        billingService.recordWebhookEvent(
          'evt_002',
          'subscription.updated',
          '{}'
        )
      )

      await expect(
        promise(billingService.markWebhookEventProcessed(event.id, 'success'))
      ).resolves.toBeUndefined()
    })

    it('should mark a webhook event as failed with error', async () => {
      const event = await promise(
        billingService.recordWebhookEvent(
          'evt_003',
          'subscription.canceled',
          '{}'
        )
      )

      await expect(
        promise(
          billingService.markWebhookEventProcessed(
            event.id,
            'failed',
            'Processing error'
          )
        )
      ).resolves.toBeUndefined()
    })
  })
})
