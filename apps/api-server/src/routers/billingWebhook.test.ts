import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise, resolve } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createBillingWebhookService } from '~/services/billingWebhook'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { fromRouter } from '~/testing/utils'
import { createBillingWebhookRouter } from './billingWebhook'

function createMockPaddleClient(
  verifyResult?: { eventType: string; data: any },
  verifyError?: Error
) {
  return {
    verifyWebhook: (_rawBody: string, _signature: string) => {
      if (verifyError) {
        return resolve(null as any).pipe(() => {
          throw verifyError
        })
      }

      if (!verifyResult) {
        const parsed = JSON.parse(_rawBody)
        return resolve({
          eventType: parsed.event_type,
          data: parsed.data,
        })
      }

      return resolve(verifyResult)
    },
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
  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    data,
  }
}

describe('Routers > BillingWebhook', () => {
  let harness: Harness
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
  })

  beforeEach(async () => {
    await harness.reset()

    const paddleClient = createMockPaddleClient()
    const webhookService = createBillingWebhookService(
      harness.db,
      harness.services.billingService,
      paddleClient
    )

    app = fromRouter(createBillingWebhookRouter(webhookService))
  })

  after(async () => {
    await harness.close()
  })

  describe('POST /', () => {
    it('should return 400 when paddle-signature header is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: JSON.stringify(
          createWebhookPayload('evt_001', 'subscription.created', {})
        ),
        headers: { 'content-type': 'application/json' },
      })

      expect(res.statusCode).toEqual(400)
      expect(res.json()).toMatchObject({
        error: 'Missing paddle-signature header',
      })
    })

    it('should return 200 for a valid subscription.created event', async () => {
      const [customer, freePlan] = await harness.loadFixtures([
        fixtures.billing.CustomerA,
        fixtures.billing.FreePlan,
      ])

      const payload = createWebhookPayload(
        'evt_router_001',
        'subscription.created',
        {
          id: 'sub_router_001',
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
      )

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: JSON.stringify(payload),
        headers: {
          'content-type': 'application/json',
          'paddle-signature': 'ts=123;h1=abc',
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        ok: true,
        eventId: expect.any(String),
      })

      const subscription = await promise(
        harness.services.billingService.getSubscriptionByAccountId(
          customer.accountId
        )
      )

      expect(subscription).toMatchObject({
        providerSubscriptionId: 'sub_router_001',
        status: 'active',
      })
    })

    it('should return 200 for transaction.completed event', async () => {
      const payload = createWebhookPayload(
        'evt_router_txn_001',
        'transaction.completed',
        {
          id: 'txn_router_001',
          subscription_id: 'sub_001',
          status: 'completed',
        }
      )

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: JSON.stringify(payload),
        headers: {
          'content-type': 'application/json',
          'paddle-signature': 'ts=123;h1=abc',
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({ ok: true })
    })

    it('should deduplicate repeated events', async () => {
      const payload = createWebhookPayload(
        'evt_router_dedup_001',
        'transaction.completed',
        {
          id: 'txn_dedup_001',
          subscription_id: 'sub_001',
          status: 'completed',
        }
      )

      const first = await app.inject({
        method: 'POST',
        url: '/',
        payload: JSON.stringify(payload),
        headers: {
          'content-type': 'application/json',
          'paddle-signature': 'ts=123;h1=abc',
        },
      })

      expect(first.statusCode).toEqual(200)

      const second = await app.inject({
        method: 'POST',
        url: '/',
        payload: JSON.stringify(payload),
        headers: {
          'content-type': 'application/json',
          'paddle-signature': 'ts=123;h1=abc',
        },
      })

      expect(second.statusCode).toEqual(200)
      expect(second.json()).toMatchObject({ ok: true })
    })
  })
})
