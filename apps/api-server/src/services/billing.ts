import { BillingPlanWithEntitlements } from '@repro/domain'
import { tapF } from '@repro/future-utils'
import { FutureInstance, chain, chainRej, map, reject, resolve } from 'fluture'
import { Env } from '~/config/createEnv'
import { PaddleClient, createPaddleClient } from '~/modules/billing'
import { Database, attemptQuery, decodeId, encodeId } from '~/modules/database'
import {
  BillingEntitlementService,
  createBillingEntitlementService,
} from '~/services/billingEntitlements'
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

// Ordered tier list: index = ordinal (higher = more features)
const PLAN_TIER_ORDER = ['Free', 'Repro+', 'Repro++'] as const

export function getPlanTierOrdinal(planName: string): number {
  const ordinal = PLAN_TIER_ORDER.indexOf(
    planName as (typeof PLAN_TIER_ORDER)[number]
  )
  if (ordinal === -1) {
    throw badRequest(`Unknown plan name: "${planName}"`)
  }
  return ordinal
}

// Returns true if moving from currentPlanName → newPlanName is an upgrade
export function isUpgradePlan(
  currentPlanName: string,
  newPlanName: string
): boolean {
  return getPlanTierOrdinal(newPlanName) > getPlanTierOrdinal(currentPlanName)
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
  active: boolean
  createdAt: Date
}): BillingPlan {
  return {
    id: encodeId(row.id),
    name: row.name,
    providerPriceId: row.providerPriceId,
    providerProductId: row.providerProductId,
    interval: row.interval,
    active: row.active,
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
  cancelAtPeriodEnd: boolean
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
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function createBillingService(
  database: Database,
  env: Env,
  injectedPaddleClient?: PaddleClient
) {
  let paddleClient: PaddleClient | null = injectedPaddleClient ?? null

  if (!paddleClient && !env.BILLING_STUBBED) {
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

  const entitlementService: BillingEntitlementService =
    createBillingEntitlementService(database)

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

  function createPlan(params: {
    name: string
    providerPriceId: string
    providerProductId: string
    interval: 'month' | 'year'
  }): FutureInstance<Error, BillingPlan> {
    return attemptQuery(() =>
      database
        .insertInto('billing_plans')
        .values({
          name: params.name,
          providerPriceId: params.providerPriceId,
          providerProductId: params.providerProductId,
          interval: params.interval,
          active: true,
        })
        .returning([
          'id',
          'name',
          'providerPriceId',
          'providerProductId',
          'interval',
          'active',
          'createdAt',
        ])
        .executeTakeFirstOrThrow()
    ).pipe(map(asBillingPlan))
  }

  function createEntitlement(
    planId: string,
    feature: string,
    enabled: boolean,
    limit: number | null
  ): FutureInstance<Error, BillingEntitlement> {
    return attemptQuery(() =>
      database
        .insertInto('billing_plan_entitlements')
        .values({
          planId: decodeId(planId)!,
          feature,
          enabled: enabled,
          limit,
        })
        .returning(['feature', 'enabled', 'limit'])
        .executeTakeFirstOrThrow()
    ).pipe(
      map(row => ({
        feature: row.feature,
        enabled: row.enabled,
        limit: row.limit,
      }))
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

  function getPlanByName(name: string): FutureInstance<Error, BillingPlan> {
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
        .where('name', '=', name)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asBillingPlan))
  }

  function provisionFreeSubscription(
    accountId: string
  ): FutureInstance<Error, void> {
    const decodedAccountId = decodeId(accountId)

    if (decodedAccountId == null) {
      return reject(badRequest('Invalid account ID'))
    }

    // Check if subscription already exists (idempotency guard)
    const checkExisting = attemptQuery(() =>
      database
        .selectFrom('billing_subscriptions')
        .select(['id'])
        .where('accountId', '=', decodedAccountId)
        .executeTakeFirst()
    )

    const now = new Date()
    const periodEnd = new Date(now)
    // ~100 years in the future — effectively infinite for a free plan
    periodEnd.setFullYear(periodEnd.getFullYear() + 100)

    return checkExisting
      .pipe(
        chain(existing => {
          if (existing) {
            // Already has a subscription — idempotent no-op
            return resolve(undefined)
          }

          return getPlanByName(env.BILLING_DEFAULT_PLAN).pipe(
            chain(plan =>
              attemptQuery(async () => {
                await database
                  .insertInto('billing_subscriptions')
                  .values({
                    accountId: decodedAccountId,
                    // Sentinel prefix identifies self-provisioned (non-Paddle) records
                    providerSubscriptionId: `self_provisioned_${accountId}`,
                    planId: decodeId(plan.id)!,
                    status: 'active',
                    currentPeriodStart: now,
                    currentPeriodEnd: periodEnd,
                    cancelAtPeriodEnd: false,
                    canceledAt: null,
                  })
                  .execute()
              })
            )
          )
        })
      )
      .pipe(
        // Graceful degradation: if the free plan hasn't been seeded yet, log a
        // warning and continue rather than failing account creation.
        chainRej(err => {
          console.warn(
            '[billing] provisionFreeSubscription: could not provision free subscription',
            err
          )
          return resolve(undefined)
        })
      )
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
        .where('active', '=', true)
        .orderBy('name asc')
        .execute()
    ).pipe(map(rows => rows.map(asBillingPlan)))
  }

  function listPlansWithEntitlements(): FutureInstance<
    Error,
    Array<BillingPlanWithEntitlements>
  > {
    return attemptQuery(() =>
      database
        .selectFrom('billing_plans')
        .leftJoin(
          'billing_plan_entitlements',
          'billing_plan_entitlements.planId',
          'billing_plans.id'
        )
        .select([
          'billing_plans.id',
          'billing_plans.name',
          'billing_plans.interval',
          'billing_plan_entitlements.feature',
          'billing_plan_entitlements.enabled',
          'billing_plan_entitlements.limit',
        ])
        .where('billing_plans.active', '=', true)
        .orderBy('billing_plans.name asc')
        .execute()
    ).pipe(
      map(rows => {
        const planMap = new Map<number, BillingPlanWithEntitlements>()

        for (const row of rows) {
          if (!planMap.has(row.id)) {
            planMap.set(row.id, {
              id: encodeId(row.id),
              name: row.name,
              interval: row.interval,
              entitlements: [],
            })
          }

          if (row.feature !== null) {
            planMap.get(row.id)!.entitlements.push({
              feature: row.feature,
              enabled: row.enabled!,
              limit: row.limit,
            })
          }
        }

        return Array.from(planMap.values())
      })
    )
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
        getPlanById(subscription.planId).pipe(
          chain(currentPlan =>
            getPlanById(newPlanId).pipe(
              chain(newPlan => {
                const prorationMode = isUpgradePlan(
                  currentPlan.name,
                  newPlan.name
                )
                  ? 'prorated_immediately'
                  : ('prorated_next_billing_period' as const)

                return getPaddle()
                  .updateSubscription(subscription.providerSubscriptionId, {
                    items: [{ priceId: newPlan.providerPriceId, quantity: 1 }],
                    prorationBillingMode: prorationMode,
                  })
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
                      )
                        .pipe(map(asBillingSubscription))
                        .pipe(
                          tapF((result: BillingSubscription) =>
                            invalidateEntitlementCache(result.accountId)
                          )
                        )
                    )
                  )
              })
            )
          )
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
                  .set({ cancelAtPeriodEnd: true })
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
              .pipe(map(session => ({ url: session.urls.general.overview })))
          )
        )
      )
    )
  }

  function getEntitlements(
    accountId: string
  ): FutureInstance<Error, Array<BillingEntitlement>> {
    return entitlementService.getEntitlements(accountId)
  }

  function invalidateEntitlementCache(
    accountId: string
  ): FutureInstance<Error, void> {
    return entitlementService.invalidateEntitlementCache(accountId)
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
    )
      .pipe(
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
                  cancelAtPeriodEnd: params.cancelAtPeriodEnd,
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
                cancelAtPeriodEnd: params.cancelAtPeriodEnd,
                canceledAt: params.canceledAt,
              })
              .execute()
          })
        })
      )
      .pipe(tapF(() => invalidateEntitlementCache(encodeId(params.accountId))))
  }

  return {
    getOrCreateCustomer,
    getCustomerByAccountId,
    createCheckoutSession,
    createPlan,
    createEntitlement,
    getPlanById,
    getPlanByName,
    getPlanByProviderPriceId,
    listPlans,
    listPlansWithEntitlements,
    getSubscriptionByAccountId,
    changePlan,
    cancelSubscription,
    getPortalLink,
    getEntitlements,
    invalidateEntitlementCache,
    recordWebhookEvent,
    markWebhookEventProcessed,
    upsertSubscription,
    provisionFreeSubscription,
  }
}

export type BillingService = ReturnType<typeof createBillingService>
