import expect from 'expect'
import { describe, it } from 'node:test'
import { createPaddleClient } from './paddle'

describe('Modules > Billing > Paddle', () => {
  it('should create a paddle client with required config', () => {
    const client = createPaddleClient({
      apiKey: 'test_api_key',
      environment: 'sandbox',
      webhookSecret: 'test_webhook_secret',
    })

    expect(client).toMatchObject({
      createCustomer: expect.any(Function),
      getCustomer: expect.any(Function),
      createTransaction: expect.any(Function),
      getSubscription: expect.any(Function),
      updateSubscription: expect.any(Function),
      cancelSubscription: expect.any(Function),
      createPortalSession: expect.any(Function),
      verifyWebhook: expect.any(Function),
    })
  })

  it('should expose EventName constants', () => {
    const client = createPaddleClient({
      apiKey: 'test_api_key',
      environment: 'production',
      webhookSecret: 'test_webhook_secret',
    })

    expect(client.EventName).toBeDefined()
  })
})
