import { Account } from '@repro/domain'
import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Database } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { notFound } from '~/utils/errors'
import { BillingService } from './billing'
import { createDevBillingService } from './billingDev'

async function seedPlan(
  db: Database,
  name: string,
  providerPriceId: string
): Promise<number> {
  const row = await db
    .insertInto('billing_plans')
    .values({
      name,
      providerPriceId,
      providerProductId: `prod_${name}`,
      interval: 'month',
      active: 1,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  return row.id
}

async function seedEntitlement(
  db: Database,
  planId: number,
  feature: string,
  enabled: boolean,
  limit: number | null
): Promise<void> {
  await db
    .insertInto('billing_plan_entitlements')
    .values({
      planId,
      feature,
      enabled: enabled ? 1 : 0,
      limit,
    })
    .execute()
}

describe('Services > Billing (dev adapter)', () => {
  let harness: Harness
  let billingService: BillingService
  let freePlanId: number
  let proPlanId: number

  before(async () => {
    harness = await createTestHarness()
    billingService = createDevBillingService(harness.db, harness.env)
  })

  beforeEach(async () => {
    await harness.reset()

    freePlanId = await seedPlan(harness.db, 'free', 'pri_free_001')
    proPlanId = await seedPlan(harness.db, 'pro', 'pri_pro_001')

    await seedEntitlement(harness.db, freePlanId, 'recordings', true, 10)
    await seedEntitlement(harness.db, freePlanId, 'projects', true, 1)
    await seedEntitlement(harness.db, proPlanId, 'recordings', true, null)
    await seedEntitlement(harness.db, proPlanId, 'projects', true, null)
  })

  after(async () => {
    await harness.close()
  })

  async function createTestAccount(): Promise<Account> {
    return promise(
      harness.services.accountService.createAccount('Test Org')
    )
  }

  describe('getOrCreateCustomer', () => {
    it('should create a new billing customer for an account', async () => {
      const account = await createTestAccount()

      const customer = await promise(
        billingService.getOrCreateCustomer(
          account.id,
          'billing-test@repro.test'
        )
      )

      expect(customer).toMatchObject({
        id: expect.any(String),
        accountId: account.id,
        providerCustomerId: expect.any(String),
        createdAt: expect.any(Date),
      })
    })

    it('should return existing customer on repeated calls', async () => {
      const account = await createTestAccount()

      const first = await promise(
        billingService.getOrCreateCustomer(
          account.id,
          'billing-idem@repro.test'
        )
      )

      const second = await promise(
        billingService.getOrCreateCustomer(
          account.id,
          'billing-idem@repro.test'
        )
      )

      expect(first.id).toBe(second.id)
      expect(first.providerCustomerId).toBe(second.providerCustomerId)
    })
  })

  describe('listPlans', () => {
    it('should list active plans', async () => {
      const plans = await promise(billingService.listPlans())

      expect(plans).toHaveLength(2)
      expect(plans.map(p => p.name)).toEqual(
        expect.arrayContaining(['free', 'pro'])
      )
    })

    it('should not list inactive plans', async () => {
      await harness.db
        .updateTable('billing_plans')
        .set({ active: 0 })
        .where('id', '=', proPlanId)
        .execute()

      const plans = await promise(billingService.listPlans())

      expect(plans).toHaveLength(1)
      expect(plans[0]?.name).toBe('free')
    })
  })

  describe('getPlanById', () => {
    it('should return a plan by ID', async () => {
      const plans = await promise(billingService.listPlans())
      const plan = await promise(billingService.getPlanById(plans[0]!.id))

      expect(plan.name).toBe(plans[0]!.name)
    })

    it('should throw not-found for invalid plan ID', async () => {
      await expect(
        promise(billingService.getPlanById('invalid-id'))
      ).rejects.toThrow(notFound())
    })
  })

  describe('createCheckoutSession', () => {
    it('should create a checkout session and subscription', async () => {
      const account = await createTestAccount()
      const plans = await promise(billingService.listPlans())
      const freePlan = plans.find(p => p.name === 'free')!

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
      const account = await createTestAccount()

      await expect(
        promise(billingService.getSubscriptionByAccountId(account.id))
      ).rejects.toThrow(notFound())
    })
  })

  describe('changePlan', () => {
    it('should change the subscription plan', async () => {
      const account = await createTestAccount()
      const plans = await promise(billingService.listPlans())
      const freePlan = plans.find(p => p.name === 'free')!
      const proPlan = plans.find(p => p.name === 'pro')!

      await promise(
        billingService.createCheckoutSession(
          account.id,
          'changeplan@repro.test',
          freePlan.id
        )
      )

      const updated = await promise(
        billingService.changePlan(account.id, proPlan.id)
      )

      expect(updated.planId).toBe(proPlan.id)
    })
  })

  describe('cancelSubscription', () => {
    it('should mark subscription for cancellation at period end', async () => {
      const account = await createTestAccount()
      const plans = await promise(billingService.listPlans())
      const freePlan = plans.find(p => p.name === 'free')!

      await promise(
        billingService.createCheckoutSession(
          account.id,
          'cancel@repro.test',
          freePlan.id
        )
      )

      const canceled = await promise(
        billingService.cancelSubscription(account.id)
      )

      expect(canceled.cancelAtPeriodEnd).toBe(true)
    })
  })

  describe('getEntitlements', () => {
    it('should return entitlements for the subscription plan', async () => {
      const account = await createTestAccount()
      const plans = await promise(billingService.listPlans())
      const proPlan = plans.find(p => p.name === 'pro')!

      await promise(
        billingService.createCheckoutSession(
          account.id,
          'entitlements@repro.test',
          proPlan.id
        )
      )

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
      const account = await createTestAccount()
      const plans = await promise(billingService.listPlans())
      const freePlan = plans.find(p => p.name === 'free')!

      await promise(
        billingService.createCheckoutSession(
          account.id,
          'free-ent@repro.test',
          freePlan.id
        )
      )

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
    it('should return a portal URL in dev mode', async () => {
      const portal = await promise(billingService.getPortalLink('any-id'))

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
