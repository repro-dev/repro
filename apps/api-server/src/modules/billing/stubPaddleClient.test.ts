import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createStubPaddleClient } from './stubPaddleClient'

describe('Modules > Billing > StubPaddleClient', () => {
  let harness: Harness

  before(async () => {
    harness = await createTestHarness()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('createCustomer', () => {
    it('should return a Customer with dev_cus_ prefix', async () => {
      const client = createStubPaddleClient(harness.db)
      const customer = await promise(
        client.createCustomer('test@repro.test', 'Test User')
      )

      expect(customer.id).toMatch(/^dev_cus_/)
      expect(customer.email).toBe('test@repro.test')
    })
  })

  describe('createTransaction', () => {
    it('should create a subscription in the DB and return a dev_txn_ transaction', async () => {
      const [account, plan] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.FreePlan,
      ])

      const client = createStubPaddleClient(harness.db)
      const transaction = await promise(
        client.createTransaction({
          customerId: `dev_cus_${account.id}`,
          items: [{ priceId: plan.providerPriceId, quantity: 1 }],
          customData: { accountId: account.id },
        })
      )

      expect(transaction.id).toMatch(/^dev_txn_/)

      const subscription = await promise(
        harness.services.billingService.getSubscriptionByAccountId(account.id)
      )

      expect(subscription).toMatchObject({
        accountId: account.id,
        status: 'active',
        planId: plan.id,
      })
    })

    it('should reject if customData.accountId is missing', async () => {
      const [plan] = await harness.loadFixtures([fixtures.billing.FreePlan])
      const client = createStubPaddleClient(harness.db)

      await expect(
        promise(
          client.createTransaction({
            customerId: 'dev_cus_test',
            items: [{ priceId: plan.providerPriceId, quantity: 1 }],
          })
        )
      ).rejects.toMatchObject({ name: 'BadRequestError' })
    })
  })

  describe('updateSubscription', () => {
    it('should return a stub Subscription without throwing', async () => {
      const client = createStubPaddleClient(harness.db)
      const result = await promise(
        client.updateSubscription('sub_123', {
          items: [{ priceId: 'pri_001', quantity: 1 }],
          prorationBillingMode: 'prorated_immediately',
        })
      )

      expect(result.id).toBe('sub_123')
    })
  })

  describe('cancelSubscription', () => {
    it('should return a stub Subscription without throwing', async () => {
      const client = createStubPaddleClient(harness.db)
      const result = await promise(client.cancelSubscription('sub_456'))

      expect(result.id).toBe('sub_456')
    })
  })

  describe('createPortalSession', () => {
    it('should return a portal session with localhost URL', async () => {
      const client = createStubPaddleClient(harness.db)
      const session = await promise(
        client.createPortalSession('cus_001', ['sub_001'])
      )

      expect(session.urls.general.overview).toBe(
        'http://localhost:3000/billing'
      )
    })
  })

  describe('getCustomer', () => {
    it('should reject with not-implemented error', async () => {
      const client = createStubPaddleClient(harness.db)

      await expect(
        promise(client.getCustomer('cus_001'))
      ).rejects.toMatchObject({ name: 'NotImplemented' })
    })
  })

  describe('getSubscription', () => {
    it('should reject with not-implemented error', async () => {
      const client = createStubPaddleClient(harness.db)

      await expect(
        promise(client.getSubscription('sub_001'))
      ).rejects.toMatchObject({ name: 'NotImplemented' })
    })
  })

  describe('verifyWebhook', () => {
    it('should reject with not-implemented error', async () => {
      const client = createStubPaddleClient(harness.db)

      await expect(
        promise(client.verifyWebhook('raw-body', 'sig'))
      ).rejects.toMatchObject({ name: 'NotImplemented' })
    })
  })
})
