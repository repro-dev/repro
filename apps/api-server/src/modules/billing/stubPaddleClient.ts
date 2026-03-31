import {
  Customer,
  CustomerPortalSession,
  EventName,
  Subscription,
  Transaction,
} from '@paddle/paddle-node-sdk'
import { FutureInstance, chain, map, reject, resolve } from 'fluture'
import { Database, attemptQuery, decodeId } from '~/modules/database'
import { badRequest, notImplemented } from '~/utils/errors'

export function createStubPaddleClient(database: Database) {
  function createCustomer(
    email: string,
    name?: string
  ): FutureInstance<Error, Customer> {
    const id = `dev_cus_${email}`
    return resolve({ id, email, name } as Customer)
  }

  function getCustomer(_customerId: string): FutureInstance<Error, Customer> {
    return reject(notImplemented('getCustomer'))
  }

  function createTransaction(params: {
    customerId: string
    items: Array<{ priceId: string; quantity: number }>
    customData?: Record<string, string>
  }): FutureInstance<Error, Transaction> {
    const accountId = params.customData?.['accountId']

    if (!accountId) {
      return reject(badRequest('customData.accountId is required'))
    }

    const decodedAccountId = decodeId(accountId)

    if (decodedAccountId == null) {
      return reject(badRequest('Invalid accountId'))
    }

    const priceId = params.items[0]?.priceId ?? ''
    const providerSubscriptionId = `dev_sub_${accountId}`

    return attemptQuery(() =>
      database
        .selectFrom('billing_plans')
        .select(['id'])
        .where('providerPriceId', '=', priceId)
        .executeTakeFirstOrThrow()
    )
      .pipe(
        chain(plan =>
          attemptQuery(() =>
            database
              .selectFrom('billing_subscriptions')
              .select(['id'])
              .where('providerSubscriptionId', '=', providerSubscriptionId)
              .executeTakeFirst()
          ).pipe(
            chain(existing => {
              if (existing) {
                return attemptQuery(async () => {
                  await database
                    .updateTable('billing_subscriptions')
                    .set({
                      planId: plan.id,
                      status: 'active',
                      currentPeriodStart: new Date(),
                      currentPeriodEnd: new Date(
                        Date.now() + 30 * 24 * 60 * 60 * 1000
                      ),
                      cancelAtPeriodEnd: false,
                      canceledAt: null,
                    })
                    .where('id', '=', existing.id)
                    .execute()
                })
              }

              return attemptQuery(async () => {
                await database
                  .insertInto('billing_subscriptions')
                  .values({
                    accountId: decodedAccountId,
                    providerSubscriptionId,
                    planId: plan.id,
                    status: 'active',
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date(
                      Date.now() + 30 * 24 * 60 * 60 * 1000
                    ),
                    cancelAtPeriodEnd: false,
                    canceledAt: null,
                  })
                  .execute()
              })
            })
          )
        )
      )
      .pipe(map(() => ({ id: `dev_txn_${accountId}` }) as Transaction))
  }

  function getSubscription(
    _subscriptionId: string
  ): FutureInstance<Error, Subscription> {
    return reject(notImplemented('getSubscription'))
  }

  function updateSubscription(
    subscriptionId: string,
    _params: {
      items: Array<{ priceId: string; quantity: number }>
      prorationBillingMode:
        | 'prorated_immediately'
        | 'prorated_next_billing_period'
        | 'full_immediately'
        | 'full_next_billing_period'
        | 'do_not_bill'
    }
  ): FutureInstance<Error, Subscription> {
    return resolve({ id: subscriptionId } as Subscription)
  }

  function cancelSubscription(
    subscriptionId: string,
    _effectiveFrom?: 'next_billing_period' | 'immediately'
  ): FutureInstance<Error, Subscription> {
    return resolve({ id: subscriptionId } as Subscription)
  }

  function createPortalSession(
    _customerId: string,
    _subscriptionIds: Array<string>
  ): FutureInstance<Error, CustomerPortalSession> {
    return resolve({
      urls: { general: { overview: 'http://localhost:3000/billing' } },
    } as CustomerPortalSession)
  }

  function verifyWebhook(
    _rawBody: string,
    _signature: string
  ): FutureInstance<Error, { eventType: string; data: any }> {
    return reject(notImplemented('verifyWebhook'))
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
