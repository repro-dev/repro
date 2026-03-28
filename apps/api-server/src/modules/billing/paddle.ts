import {
  Customer,
  CustomerPortalSession,
  Environment,
  EventName,
  Paddle,
  Subscription,
  Transaction,
} from '@paddle/paddle-node-sdk'
import { attemptP, FutureInstance } from 'fluture'

export interface PaddleConfig {
  apiKey: string
  environment: 'sandbox' | 'production'
  webhookSecret: string
}

export function createPaddleClient(config: PaddleConfig) {
  const paddle = new Paddle(config.apiKey, {
    environment:
      config.environment === 'sandbox'
        ? Environment.sandbox
        : Environment.production,
  })

  function createCustomer(
    email: string,
    name?: string
  ): FutureInstance<Error, Customer> {
    return attemptP(() => paddle.customers.create({ email, name }))
  }

  function getCustomer(customerId: string): FutureInstance<Error, Customer> {
    return attemptP(() => paddle.customers.get(customerId))
  }

  function createTransaction(params: {
    customerId: string
    items: Array<{ priceId: string; quantity: number }>
    customData?: Record<string, string>
  }): FutureInstance<Error, Transaction> {
    return attemptP(() =>
      paddle.transactions.create({
        customerId: params.customerId,
        items: params.items,
        customData: params.customData,
      })
    )
  }

  function getSubscription(
    subscriptionId: string
  ): FutureInstance<Error, Subscription> {
    return attemptP(() => paddle.subscriptions.get(subscriptionId))
  }

  function updateSubscription(
    subscriptionId: string,
    params: {
      items: Array<{ priceId: string; quantity: number }>
      prorationBillingMode:
        | 'prorated_immediately'
        | 'prorated_next_billing_period'
        | 'full_immediately'
        | 'full_next_billing_period'
        | 'do_not_bill'
    }
  ): FutureInstance<Error, Subscription> {
    return attemptP(() =>
      paddle.subscriptions.update(subscriptionId, {
        items: params.items,
        prorationBillingMode: params.prorationBillingMode,
      })
    )
  }

  function cancelSubscription(
    subscriptionId: string,
    effectiveFrom: 'next_billing_period' | 'immediately' = 'next_billing_period'
  ): FutureInstance<Error, Subscription> {
    return attemptP(() =>
      paddle.subscriptions.cancel(subscriptionId, { effectiveFrom })
    )
  }

  function createPortalSession(
    customerId: string,
    subscriptionIds: Array<string>
  ): FutureInstance<Error, CustomerPortalSession> {
    return attemptP(() =>
      paddle.customerPortalSessions.create(customerId, subscriptionIds)
    )
  }

  function verifyWebhook(
    rawBody: string,
    signature: string
  ): FutureInstance<Error, { eventType: string; data: any }> {
    return attemptP(async () => {
      const event = await paddle.webhooks.unmarshal(
        rawBody,
        config.webhookSecret,
        signature
      )

      if (!event) {
        throw new Error('Invalid webhook signature')
      }

      return {
        eventType: event.eventType,
        data: event.data,
      }
    })
  }

  return {
    createCustomer,
    getCustomer,
    createTransaction,
    getSubscription,
    updateSubscription,
    cancelSubscription,
    createPortalSession,
    verifyWebhook,
    EventName,
  }
}

export type PaddleClient = ReturnType<typeof createPaddleClient>
