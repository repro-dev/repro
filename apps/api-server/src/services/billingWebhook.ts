import {
  FutureInstance,
  chain,
  map,
  reject,
  resolve,
} from 'fluture'
import { PaddleClient } from '~/modules/billing'
import { Database, attemptQuery, encodeId } from '~/modules/database'
import { BillingService } from '~/services/billing'

interface WebhookResult {
  eventId: string
  skipped: boolean
}

interface SubscriptionData {
  id: string
  status: string
  customer_id: string
  items: Array<{
    price: {
      id: string
      product_id: string
    }
    quantity: number
  }>
  current_billing_period?: {
    starts_at: string
    ends_at: string
  }
  canceled_at?: string
  scheduled_change?: {
    action: string
    effective_at: string
  } | null
}

interface TransactionData {
  id: string
  subscription_id: string
  status: string
}

export function createBillingWebhookService(
  database: Database,
  billingService: BillingService,
  paddleClient: PaddleClient
) {
  function verifyAndRecord(
    rawBody: string,
    signature: string
  ): FutureInstance<Error, { eventId: string; eventType: string; data: any; skipped: boolean }> {
    return paddleClient.verifyWebhook(rawBody, signature).pipe(
      chain(event =>
        billingService
          .recordWebhookEvent(
            JSON.parse(rawBody).event_id,
            event.eventType,
            rawBody
          )
          .pipe(
            map(record => ({
              eventId: record.id,
              eventType: event.eventType,
              data: event.data,
              skipped: record.alreadyProcessed,
            }))
          )
      )
    )
  }

  function resolveBillingPeriod(
    data: SubscriptionData
  ): FutureInstance<Error, { start: Date; end: Date }> {
    if (!data.current_billing_period) {
      return reject(
        new Error(
          `Missing current_billing_period for subscription: ${data.id}`
        )
      )
    }

    return resolve({
      start: new Date(data.current_billing_period.starts_at),
      end: new Date(data.current_billing_period.ends_at),
    })
  }

  function handleSubscriptionCreated(
    eventId: string,
    data: SubscriptionData
  ): FutureInstance<Error, WebhookResult> {
    return resolveCustomerAccountId(data.customer_id).pipe(
      chain(accountId =>
        resolvePlanId(data.items).pipe(
          chain(planId =>
            resolveBillingPeriod(data).pipe(
              chain(period =>
                billingService
                  .upsertSubscription({
                    accountId,
                    providerSubscriptionId: data.id,
                    planId,
                    status: 'active',
                    currentPeriodStart: period.start,
                    currentPeriodEnd: period.end,
                    cancelAtPeriodEnd: false,
                    canceledAt: null,
                  })
                  .pipe(chain(() => markSuccess(eventId)))
              )
            )
          )
        )
      )
    )
  }

  function handleSubscriptionUpdated(
    eventId: string,
    data: SubscriptionData
  ): FutureInstance<Error, WebhookResult> {
    return resolveCustomerAccountId(data.customer_id).pipe(
      chain(accountId =>
        resolvePlanId(data.items).pipe(
          chain(planId =>
            resolveBillingPeriod(data).pipe(
              chain(period =>
                billingService
                  .upsertSubscription({
                    accountId,
                    providerSubscriptionId: data.id,
                    planId,
                    status: mapSubscriptionStatus(data.status),
                    currentPeriodStart: period.start,
                    currentPeriodEnd: period.end,
                    cancelAtPeriodEnd:
                      data.scheduled_change?.action === 'cancel',
                    canceledAt: data.canceled_at
                      ? new Date(data.canceled_at)
                      : null,
                  })
                  .pipe(chain(() => markSuccess(eventId)))
              )
            )
          )
        )
      )
    )
  }

  function handleSubscriptionCanceled(
    eventId: string,
    data: SubscriptionData
  ): FutureInstance<Error, WebhookResult> {
    return resolveCustomerAccountId(data.customer_id).pipe(
      chain(accountId =>
        resolvePlanId(data.items).pipe(
          chain(planId =>
            resolveBillingPeriod(data).pipe(
              chain(period =>
                billingService
                  .upsertSubscription({
                    accountId,
                    providerSubscriptionId: data.id,
                    planId,
                    status: 'canceled',
                    currentPeriodStart: period.start,
                    currentPeriodEnd: period.end,
                    cancelAtPeriodEnd: false,
                    canceledAt: data.canceled_at
                      ? new Date(data.canceled_at)
                      : new Date(),
                  })
                  .pipe(chain(() => markSuccess(eventId)))
              )
            )
          )
        )
      )
    )
  }

  function handleTransactionCompleted(
    eventId: string,
    _data: TransactionData
  ): FutureInstance<Error, WebhookResult> {
    return markSuccess(eventId)
  }

  function handleTransactionPaymentFailed(
    eventId: string,
    data: TransactionData
  ): FutureInstance<Error, WebhookResult> {
    if (!data.subscription_id) {
      return markSuccess(eventId)
    }

    return attemptQuery(() =>
      database
        .selectFrom('billing_subscriptions')
        .select(['accountId'])
        .where('providerSubscriptionId', '=', data.subscription_id)
        .executeTakeFirst()
    ).pipe(
      chain(subscription => {
        if (!subscription) {
          return markSuccess(eventId)
        }

        return attemptQuery(async () => {
          await database
            .updateTable('billing_subscriptions')
            .set({ status: 'past_due' })
            .where('providerSubscriptionId', '=', data.subscription_id)
            .execute()
        }).pipe(
          chain(() => {
            billingService.invalidateEntitlementCache(
              encodeId(subscription.accountId)
            )
            return markSuccess(eventId)
          })
        )
      })
    )
  }

  function resolveCustomerAccountId(
    providerCustomerId: string
  ): FutureInstance<Error, number> {
    return attemptQuery(() =>
      database
        .selectFrom('billing_customers')
        .select(['accountId'])
        .where('providerCustomerId', '=', providerCustomerId)
        .executeTakeFirstOrThrow(
          () => new Error(`Unknown customer: ${providerCustomerId}`)
        )
    ).pipe(map(row => row.accountId))
  }

  function resolvePlanId(
    items: SubscriptionData['items']
  ): FutureInstance<Error, number> {
    const priceId = items[0]?.price.id
    if (!priceId) {
      return reject(new Error('Missing price ID in webhook items'))
    }

    return attemptQuery(() =>
      database
        .selectFrom('billing_plans')
        .select(['id'])
        .where('providerPriceId', '=', priceId)
        .executeTakeFirstOrThrow(
          () => new Error(`Unknown price: ${priceId}`)
        )
    ).pipe(map(row => row.id))
  }

  function mapSubscriptionStatus(
    status: string
  ): 'active' | 'past_due' | 'paused' | 'canceled' | 'trialing' {
    switch (status) {
      case 'active':
        return 'active'
      case 'past_due':
        return 'past_due'
      case 'paused':
        return 'paused'
      case 'canceled':
        return 'canceled'
      case 'trialing':
        return 'trialing'
      default:
        return 'past_due'
    }
  }

  function markSuccess(
    eventId: string
  ): FutureInstance<Error, WebhookResult> {
    return billingService
      .markWebhookEventProcessed(eventId, 'success')
      .pipe(map(() => ({ eventId, skipped: false })))
  }

  function markFailed(
    eventId: string,
    error: string
  ): FutureInstance<Error, WebhookResult> {
    return billingService
      .markWebhookEventProcessed(eventId, 'failed', error)
      .pipe(map(() => ({ eventId, skipped: false })))
  }

  return {
    verifyAndRecord,
    handleSubscriptionCreated,
    handleSubscriptionUpdated,
    handleSubscriptionCanceled,
    handleTransactionCompleted,
    handleTransactionPaymentFailed,
    markFailed,
  }
}

export type BillingWebhookService = ReturnType<
  typeof createBillingWebhookService
>
