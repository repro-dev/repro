import expect from 'expect'
import { promise, resolve } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness, fixtures } from '~/testing'
import {
  BillingWebhookService,
  createBillingWebhookService,
} from './billingWebhook'

function createMockPaddleClient(eventType: string, data: any) {
  return {
    verifyWebhook: (_rawBody: string, _signature: string) =>
      resolve({ eventType, data }),
    createCustomer: () => resolve({} as any),
    getCustomer: () => resolve({} as any),
    createTransaction: () => resolve({} as any),
    getSubscription: () => resolve({} as any),
    updateSubscription: () => resolve({} as any),
    cancelSubscription: () => resolve({} as any),
    createPortalSession: () => resolve({} as any),
    EventName: {},
  } as any
}

function createWebhookPayload(eventId: string, eventType: string, data: any) {
  return JSON.stringify({
    event_id: eventId,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    data,
  })
}

describe('Services > BillingWebhook', () => {
  let harness: Harness
  let webhookService: BillingWebhookService

  before(async () => {
    harness = await createTestHarness()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('subscription.created', () => {
    it('should create a new subscription from a webhook event', async () => {
      const [customer, freePlan] = await harness.loadFixtures([
        fixtures.billing.CustomerA,
        fixtures.billing.FreePlan,
      ])

      const subscriptionData = {
        id: 'sub_webhook_001',
        status: 'active',
        customer_id: customer.providerCustomerId,
        items: [
          {
            price: {
              id: freePlan.providerPriceId,
              product_id: freePlan.providerProductId,
            },
            quantity: 1,
          },
        ],
        current_billing_period: {
          starts_at: '2026-02-17T12:00:00.000Z',
          ends_at: '2026-03-17T12:00:00.000Z',
        },
      }

      webhookService = createBillingWebhookService(
        harness.db,
        harness.services.billingService,
        createMockPaddleClient('subscription.created', subscriptionData)
      )

      const rawBody = createWebhookPayload(
        'evt_sub_created_001',
        'subscription.created',
        subscriptionData
      )

      const record = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      expect(record.skipped).toBe(false)

      const result = await promise(
        webhookService.handleSubscriptionCreated(record.eventId, record.data)
      )

      expect(result).toMatchObject({
        eventId: record.eventId,
        skipped: false,
      })

      const subscription = await promise(
        harness.services.billingService.getSubscriptionByAccountId(
          customer.accountId
        )
      )

      expect(subscription).toMatchObject({
        providerSubscriptionId: 'sub_webhook_001',
        status: 'active',
        planId: freePlan.id,
      })
    })
  })

  describe('subscription.updated', () => {
    it('should update a subscription plan on upgrade', async () => {
      const [customer, , proPlan] = await harness.loadFixtures([
        fixtures.billing.CustomerA,
        fixtures.billing.AccountA_FreePlan_Checkout,
        fixtures.billing.ProPlan,
      ])

      const subscriptionData = {
        id: 'dev_sub_' + customer.accountId,
        status: 'active',
        customer_id: customer.providerCustomerId,
        items: [
          {
            price: {
              id: proPlan.providerPriceId,
              product_id: proPlan.providerProductId,
            },
            quantity: 1,
          },
        ],
        current_billing_period: {
          starts_at: '2026-02-17T12:00:00.000Z',
          ends_at: '2026-03-17T12:00:00.000Z',
        },
      }

      webhookService = createBillingWebhookService(
        harness.db,
        harness.services.billingService,
        createMockPaddleClient('subscription.updated', subscriptionData)
      )

      const rawBody = createWebhookPayload(
        'evt_sub_updated_001',
        'subscription.updated',
        subscriptionData
      )

      const record = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      await promise(
        webhookService.handleSubscriptionUpdated(record.eventId, record.data)
      )

      const subscription = await promise(
        harness.services.billingService.getSubscriptionByAccountId(
          customer.accountId
        )
      )

      expect(subscription.planId).toBe(proPlan.id)
      expect(subscription.status).toBe('active')
    })
  })

  describe('subscription.canceled', () => {
    it('should mark subscription as canceled', async () => {
      const [customer] = await harness.loadFixtures([
        fixtures.billing.CustomerA,
        fixtures.billing.AccountA_FreePlan_Checkout,
      ])

      const freePlan = (
        await promise(harness.services.billingService.listPlans())
      ).find(p => p.name === 'Free')!

      const subscriptionData = {
        id: 'dev_sub_' + customer.accountId,
        status: 'canceled',
        customer_id: customer.providerCustomerId,
        items: [
          {
            price: {
              id: freePlan.providerPriceId,
              product_id: freePlan.providerProductId,
            },
            quantity: 1,
          },
        ],
        current_billing_period: {
          starts_at: '2026-02-17T12:00:00.000Z',
          ends_at: '2026-03-17T12:00:00.000Z',
        },
        canceled_at: '2026-02-20T12:00:00.000Z',
      }

      webhookService = createBillingWebhookService(
        harness.db,
        harness.services.billingService,
        createMockPaddleClient('subscription.canceled', subscriptionData)
      )

      const rawBody = createWebhookPayload(
        'evt_sub_canceled_001',
        'subscription.canceled',
        subscriptionData
      )

      const record = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      await promise(
        webhookService.handleSubscriptionCanceled(record.eventId, record.data)
      )

      const subscription = await promise(
        harness.services.billingService.getSubscriptionByAccountId(
          customer.accountId
        )
      )

      expect(subscription.status).toBe('canceled')
      expect(subscription.canceledAt).toBeInstanceOf(Date)
    })
  })

  describe('transaction.payment_failed', () => {
    it('should mark subscription as past_due', async () => {
      const [customer, subscription] = await harness.loadFixtures([
        fixtures.billing.CustomerA,
        fixtures.billing.AccountA_FreePlan_Subscription,
      ])

      const transactionData = {
        id: 'txn_fail_001',
        subscription_id: subscription.providerSubscriptionId,
        status: 'failed',
      }

      webhookService = createBillingWebhookService(
        harness.db,
        harness.services.billingService,
        createMockPaddleClient('transaction.payment_failed', transactionData)
      )

      const rawBody = createWebhookPayload(
        'evt_txn_failed_001',
        'transaction.payment_failed',
        transactionData
      )

      const record = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      await promise(
        webhookService.handleTransactionPaymentFailed(
          record.eventId,
          record.data
        )
      )

      const updated = await promise(
        harness.services.billingService.getSubscriptionByAccountId(
          customer.accountId
        )
      )

      expect(updated.status).toBe('past_due')
    })

    it('should succeed gracefully when subscription_id is missing', async () => {
      webhookService = createBillingWebhookService(
        harness.db,
        harness.services.billingService,
        createMockPaddleClient('transaction.payment_failed', {
          id: 'txn_no_sub_001',
          status: 'failed',
        })
      )

      const rawBody = createWebhookPayload(
        'evt_txn_nosub_001',
        'transaction.payment_failed',
        { id: 'txn_no_sub_001', status: 'failed' }
      )

      const record = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      const result = await promise(
        webhookService.handleTransactionPaymentFailed(
          record.eventId,
          record.data
        )
      )

      expect(result).toMatchObject({
        eventId: record.eventId,
        skipped: false,
      })
    })
  })

  describe('subscription.paused', () => {
    it('should mark subscription as paused', async () => {
      const [customer] = await harness.loadFixtures([
        fixtures.billing.CustomerA,
        fixtures.billing.AccountA_FreePlan_Subscription,
      ])

      const subscriptionData = {
        id: 'dev_sub_' + customer.accountId,
        status: 'paused',
        customer_id: customer.providerCustomerId,
        items: [],
      }

      webhookService = createBillingWebhookService(
        harness.db,
        harness.services.billingService,
        createMockPaddleClient('subscription.paused', subscriptionData)
      )

      const rawBody = createWebhookPayload(
        'evt_sub_paused_001',
        'subscription.paused',
        subscriptionData
      )

      const record = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      await promise(
        webhookService.handleSubscriptionPaused(record.eventId, record.data)
      )

      const subscription = await promise(
        harness.services.billingService.getSubscriptionByAccountId(
          customer.accountId
        )
      )

      expect(subscription.status).toBe('paused')
    })
  })

  describe('subscription.resumed', () => {
    it('should mark subscription as active after being paused', async () => {
      const [customer] = await harness.loadFixtures([
        fixtures.billing.CustomerA,
        fixtures.billing.AccountA_FreePlan_Subscription,
      ])

      // Precondition: set status to paused
      await harness.db
        .updateTable('billing_subscriptions')
        .set({ status: 'paused' })
        .where('providerSubscriptionId', '=', 'dev_sub_' + customer.accountId)
        .execute()

      const subscriptionData = {
        id: 'dev_sub_' + customer.accountId,
        status: 'active',
        customer_id: customer.providerCustomerId,
        items: [],
      }

      webhookService = createBillingWebhookService(
        harness.db,
        harness.services.billingService,
        createMockPaddleClient('subscription.resumed', subscriptionData)
      )

      const rawBody = createWebhookPayload(
        'evt_sub_resumed_001',
        'subscription.resumed',
        subscriptionData
      )

      const record = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      await promise(
        webhookService.handleSubscriptionResumed(record.eventId, record.data)
      )

      const subscription = await promise(
        harness.services.billingService.getSubscriptionByAccountId(
          customer.accountId
        )
      )

      expect(subscription.status).toBe('active')
    })
  })

  describe('idempotency', () => {
    it('should skip already processed events', async () => {
      webhookService = createBillingWebhookService(
        harness.db,
        harness.services.billingService,
        createMockPaddleClient('transaction.completed', {
          id: 'txn_001',
          subscription_id: 'sub_001',
          status: 'completed',
        })
      )

      const rawBody = createWebhookPayload(
        'evt_idempotent_001',
        'transaction.completed',
        { id: 'txn_001', subscription_id: 'sub_001', status: 'completed' }
      )

      const first = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      expect(first.skipped).toBe(false)

      const second = await promise(
        webhookService.verifyAndRecord(rawBody, 'test-sig')
      )

      expect(second.skipped).toBe(true)
    })
  })
})
