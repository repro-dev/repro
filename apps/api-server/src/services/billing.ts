import {
  FutureInstance,
  chain,
  map,
  reject,
  resolve,
} from 'fluture'
import { Env } from '~/config/createEnv'
import { PaddleClient, createPaddleClient } from '~/modules/billing'
import {
  Database,
  attemptQuery,
  decodeId,
  encodeId,
} from '~/modules/database'
import { badRequest, notFound, serverError } from '~/utils/errors'

export interface BillingCustomer {
  id: string
  accountId: string
  providerCustomerId: string
  createdAt: Date
}

export interface BillingPlan {
  id: string
  name: string
  providerPriceId: string
  providerProductId: string
  interval: 'month' | 'year'
  active: boolean
  createdAt: Date
}

export interface BillingSubscription {
  id: string
  accountId: string
  providerSubscriptionId: string
  planId: string
  status: 'active' | 'past_due' | 'paused' | 'canceled' | 'trialing'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  canceledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface BillingEntitlement {
  feature: string
  enabled: boolean
  limit: number | null
}

export interface CheckoutResult {
  transactionId: string
}

export interface PortalSession {
  url: string
}

const ENTITLEMENT_CACHE_TTL_MS = 60_000

interface CachedEntitlements {
  entitlements: Array<BillingEntitlement>
  expiresAt: number
}

function asBillingCustomer(row: {
  id: number
  accountId: number
  providerCustomerId: string
  createdAt: Date
}): BillingCustomer {
  return {
    id: encodeId(row.id),
    accountId: encodeId(row.accountId),
    providerCustomerId: row.providerCustomerId,
    createdAt: row.createdAt,
  }
}

function asBillingPlan(row: {
  id: number
  name: string
  providerPriceId: string
  providerProductId: string
  interval: 'month' | 'year'
  active: number
  createdAt: Date
}): BillingPlan {
  return {
    id: encodeId(row.id),
    name: row.name,
    providerPriceId: row.providerPriceId,
    providerProductId: row.providerProductId,
    interval: row.interval,
    active: !!row.active,
    createdAt: row.createdAt,
  }
}

function asBillingSubscription(row: {
  id: number
  accountId: number
  providerSubscriptionId: string
  planId: number
  status: 'active' | 'past_due' | 'paused' | 'canceled' | 'trialing'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: number
  canceledAt: Date | null
  createdAt: Date
  updatedAt: Date
}): BillingSubscription {
  return {
    id: encodeId(row.id),
    accountId: encodeId(row.accountId),
    providerSubscriptionId: row.providerSubscriptionId,
    planId: encodeId(row.planId),
    status: row.status,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: !!row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function createBillingService(database: Database, env: Env) {
  let paddleClient: PaddleClient | null = null

  if (!env.BILLING_STUBBED) {
    if (!env.PADDLE_API_KEY || !env.PADDLE_WEBHOOK_SECRET) {
      throw new Error(
        'PADDLE_API_KEY and PADDLE_WEBHOOK_SECRET are required when BILLING_STUBBED=false'
      )
    }

    paddleClient = createPaddleClient({
      apiKey: env.PADDLE_API_KEY,
      environment: env.PADDLE_ENVIRONMENT,
      webhookSecret: env.PADDLE_WEBHOOK_SECRET,
    })
  }

  const entitlementCache = new Map<string, CachedEntitlements>()

  function getPaddle(): PaddleClient {
    if (!paddleClient) {
      throw serverError('Billing provider not configured')
    }
    return paddleClient
  }

  function getOrCreateCustomer(
    accountId: string,
    email: string,
    name?: string
  ): FutureInstance<Error, BillingCustomer> {
    const decodedAccountId = decodeId(accountId)
    if (decodedAccountId == null) {
      return reject(badRequest('Invalid account ID'))
    }

    return attemptQuery(() =>
      database
        .selectFrom('billing_customers')
        .select(['id', 'accountId', 'providerCustomerId', 'createdAt'])
        .where('accountId', '=', decodedAccountId)
        .executeTakeFirst()
    ).pipe(
      chain(existing => {
        if (existing) {
          return resolve(asBillingCustomer(existing))
        }

        return getPaddle()
          .createCustomer(email, name)
          .pipe(
            chain(customer =>
              attemptQuery(() =>
                database
                  .insertInto('billing_customers')
                  .values({
                    accountId: decodedAccountId,
                    providerCustomerId: customer.id,
                  })
                  .returning([
                    'id',
                    'accountId',
                    'providerCustomerId',
                    'createdAt',
                  ])
                  .executeTakeFirstOrThrow()
              ).pipe(map(asBillingCustomer))
            )
          )
      })
    )
  }

  function getCustomerByAccountId(
    accountId: string
  ): FutureInstance<Error, BillingCustomer> {
    return attemptQuery(() =>
      database
        .selectFrom('billing_customers')
        .select(['id', 'accountId', 'providerCustomerId', 'createdAt'])
        .where('accountId', '=', decodeId(accountId))
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asBillingCustomer))
  }

  function createCheckoutSession(
    accountId: string,
    email: string,
    planId: string,
    name?: string
  ): FutureInstance<Error, CheckoutResult> {
    return getOrCreateCustomer(accountId, email, name).pipe(
      chain(customer =>
        getPlanById(planId).pipe(
          chain(plan =>
            getPaddle()
              .createTransaction({
                customerId: customer.providerCustomerId,
                items: [{ priceId: plan.providerPriceId, quantity: 1 }],
                customData: { accountId },
              })
              .pipe(map(transaction => ({ transactionId: transaction.id })))
          )
        )
      )
    )
  }

  function getPlanById(planId: string): FutureInstance<Error, BillingPlan> {
    return attemptQuery(() =>
      database
        .selectFrom('billing_plans')
        .select([
          'id',
          'name',
          'providerPriceId',
          'providerProductId',
          'interval',
          'active',
          'createdAt',
        ])
        .where('id', '=', decodeId(planId))
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asBillingPlan))
  }

  function getPlanByProviderPriceId(
    providerPriceId: string
  ): FutureInstance<Error, BillingPlan> {
    return attemptQuery(() =>
      database
        .selectFrom('billing_plans')
        .select([
          'id',
          'name',
          'providerPriceId',
          'providerProductId',
          'interval',
          'active',
          'createdAt',
        ])
        .where('providerPriceId', '=', providerPriceId)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asBillingPlan))
  }

  function listPlans(): FutureInstance<Error, Array<BillingPlan>> {
    return attemptQuery(() =>
      database
        .selectFrom('billing_plans')
        .select([
          'id',
          'name',
          'providerPriceId',
          'providerProductId',
          'interval',
          'active',
          'createdAt',
        ])
        .where('active', '=', 1)
        .orderBy('name asc')
        .execute()
    ).pipe(map(rows => rows.map(asBillingPlan)))
  }

  function getSubscriptionByAccountId(
    accountId: string
  ): FutureInstance<Error, BillingSubscription> {
    return attemptQuery(() =>
      database
        .selectFrom('billing_subscriptions')
        .select([
          'id',
          'accountId',
          'providerSubscriptionId',
          'planId',
          'status',
          'currentPeriodStart',
          'currentPeriodEnd',
          'cancelAtPeriodEnd',
          'canceledAt',
          'createdAt',
          'updatedAt',
        ])
        .where('accountId', '=', decodeId(accountId))
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asBillingSubscription))
  }

  function changePlan(
    accountId: string,
    newPlanId: string
  ): FutureInstance<Error, BillingSubscription> {
    return getSubscriptionByAccountId(accountId).pipe(
      chain(subscription =>
        getPlanById(newPlanId).pipe(
          chain(newPlan => {
            const isUpgrade = true
            const prorationMode = isUpgrade
              ? 'prorated_immediately'
              : ('prorated_next_billing_period' as const)

            return getPaddle()
              .updateSubscription(
                subscription.providerSubscriptionId,
                {
                  items: [
                    { priceId: newPlan.providerPriceId, quantity: 1 },
                  ],
                  prorationBillingMode: prorationMode,
                }
              )
              .pipe(
                chain(() =>
                  attemptQuery(() =>
                    database
                      .updateTable('billing_subscriptions')
                      .set({ planId: decodeId(newPlan.id)! })
                      .where('id', '=', decodeId(subscription.id))
                      .returning([
                        'id',
                        'accountId',
                        'providerSubscriptionId',
                        'planId',
                        'status',
                        'currentPeriodStart',
                        'currentPeriodEnd',
                        'cancelAtPeriodEnd',
                        'canceledAt',
                        'createdAt',
                        'updatedAt',
                      ])
                      .executeTakeFirstOrThrow()
                  ).pipe(map(asBillingSubscription))
                )
              )
          })
        )
      )
    )
  }

  function cancelSubscription(
    accountId: string
  ): FutureInstance<Error, BillingSubscription> {
    return getSubscriptionByAccountId(accountId).pipe(
      chain(subscription =>
        getPaddle()
          .cancelSubscription(
            subscription.providerSubscriptionId,
            'next_billing_period'
          )
          .pipe(
            chain(() =>
              attemptQuery(() =>
                database
                  .updateTable('billing_subscriptions')
                  .set({ cancelAtPeriodEnd: 1 })
                  .where('id', '=', decodeId(subscription.id))
                  .returning([
                    'id',
                    'accountId',
                    'providerSubscriptionId',
                    'planId',
                    'status',
                    'currentPeriodStart',
                    'currentPeriodEnd',
                    'cancelAtPeriodEnd',
                    'canceledAt',
                    'createdAt',
                    'updatedAt',
                  ])
                  .executeTakeFirstOrThrow()
              ).pipe(map(asBillingSubscription))
            )
          )
      )
    )
  }

  function getPortalLink(
    accountId: string
  ): FutureInstance<Error, PortalSession> {
    return getCustomerByAccountId(accountId).pipe(
      chain(customer =>
        getSubscriptionByAccountId(accountId).pipe(
          chain(subscription =>
            getPaddle()
              .createPortalSession(customer.providerCustomerId, [
                subscription.providerSubscriptionId,
              ])
              .pipe(
                map(session => ({ url: session.urls.general.overview }))
              )
          )
        )
      )
    )
  }

  function getEntitlements(
    accountId: string
  ): FutureInstance<Error, Array<BillingEntitlement>> {
    const cached = entitlementCache.get(accountId)
    if (cached && cached.expiresAt > Date.now()) {
      return resolve(cached.entitlements)
    }

    return getSubscriptionByAccountId(accountId).pipe(
      chain(subscription =>
        attemptQuery(() =>
          database
            .selectFrom('billing_plan_entitlements')
            .select(['feature', 'enabled', 'limit'])
            .where('planId', '=', decodeId(subscription.planId))
            .execute()
        ).pipe(
          map(rows => {
            const entitlements: Array<BillingEntitlement> = rows.map(row => ({
              feature: row.feature,
              enabled: !!row.enabled,
              limit: row.limit,
            }))

            entitlementCache.set(accountId, {
              entitlements,
              expiresAt: Date.now() + ENTITLEMENT_CACHE_TTL_MS,
            })

            return entitlements
          })
        )
      )
    )
  }

  function invalidateEntitlementCache(accountId: string): void {
    entitlementCache.delete(accountId)
  }

  function recordWebhookEvent(
    providerEventId: string,
    eventType: string,
    payload: string
  ): FutureInstance<Error, { id: string; alreadyProcessed: boolean }> {
    return attemptQuery(() =>
      database
        .selectFrom('billing_events')
        .select(['id'])
        .where('providerEventId', '=', providerEventId)
        .executeTakeFirst()
    ).pipe(
      chain(existing => {
        if (existing) {
          return resolve({
            id: encodeId(existing.id),
            alreadyProcessed: true,
          })
        }

        return attemptQuery(() =>
          database
            .insertInto('billing_events')
            .values({
              providerEventId,
              eventType,
              payload,
              status: 'pending',
              error: null,
              processedAt: null,
            })
            .returning(['id'])
            .executeTakeFirstOrThrow()
        ).pipe(
          map(row => ({
            id: encodeId(row.id),
            alreadyProcessed: false,
          }))
        )
      })
    )
  }

  function markWebhookEventProcessed(
    eventId: string,
    status: 'success' | 'failed',
    error?: string
  ): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      await database
        .updateTable('billing_events')
        .set({
          status,
          error: error ?? null,
          processedAt: new Date(),
        })
        .where('id', '=', decodeId(eventId))
        .execute()
    })
  }

  function upsertSubscription(params: {
    accountId: number
    providerSubscriptionId: string
    planId: number
    status: 'active' | 'past_due' | 'paused' | 'canceled' | 'trialing'
    currentPeriodStart: Date
    currentPeriodEnd: Date
    cancelAtPeriodEnd: boolean
    canceledAt: Date | null
  }): FutureInstance<Error, void> {
    return attemptQuery(() =>
      database
        .selectFrom('billing_subscriptions')
        .select(['id'])
        .where('providerSubscriptionId', '=', params.providerSubscriptionId)
        .executeTakeFirst()
    ).pipe(
      chain(existing => {
        if (existing) {
          return attemptQuery(async () => {
            await database
              .updateTable('billing_subscriptions')
              .set({
                planId: params.planId,
                status: params.status,
                currentPeriodStart: params.currentPeriodStart,
                currentPeriodEnd: params.currentPeriodEnd,
                cancelAtPeriodEnd: params.cancelAtPeriodEnd ? 1 : 0,
                canceledAt: params.canceledAt,
              })
              .where('id', '=', existing.id)
              .execute()
          })
        }

        return attemptQuery(async () => {
          await database
            .insertInto('billing_subscriptions')
            .values({
              accountId: params.accountId,
              providerSubscriptionId: params.providerSubscriptionId,
              planId: params.planId,
              status: params.status,
              currentPeriodStart: params.currentPeriodStart,
              currentPeriodEnd: params.currentPeriodEnd,
              cancelAtPeriodEnd: params.cancelAtPeriodEnd ? 1 : 0,
              canceledAt: params.canceledAt,
            })
            .execute()
        })
      })
    )
  }

  return {
    getOrCreateCustomer,
    getCustomerByAccountId,
    createCheckoutSession,
    getPlanById,
    getPlanByProviderPriceId,
    listPlans,
    getSubscriptionByAccountId,
    changePlan,
    cancelSubscription,
    getPortalLink,
    getEntitlements,
    invalidateEntitlementCache,
    recordWebhookEvent,
    markWebhookEventProcessed,
    upsertSubscription,
  }
}

export type BillingService = ReturnType<typeof createBillingService>
