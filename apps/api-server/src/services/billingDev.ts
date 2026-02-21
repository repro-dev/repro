import { FutureInstance, chain, map, reject, resolve } from 'fluture'
import { Env } from '~/config/createEnv'
import { Database, attemptQuery, decodeId, encodeId } from '~/modules/database'
import { badRequest, notFound } from '~/utils/errors'
import {
  BillingCustomer,
  BillingEntitlement,
  BillingPlan,
  BillingService,
  BillingSubscription,
  CheckoutResult,
  PortalSession,
} from './billing'

export function createDevBillingService(
  database: Database,
  _env: Env
): BillingService {
  function getOrCreateCustomer(
    accountId: string,
    _email: string,
    _name?: string
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
      chain(
        (
          existing
        ): FutureInstance<Error, BillingCustomer> => {
          if (existing) {
            return resolve({
              id: encodeId(existing.id),
              accountId: encodeId(existing.accountId),
              providerCustomerId: existing.providerCustomerId,
              createdAt: existing.createdAt,
            })
          }

          return attemptQuery(() =>
            database
              .insertInto('billing_customers')
              .values({
                accountId: decodedAccountId,
                providerCustomerId: `dev_cus_${accountId}`,
              })
              .returning([
                'id',
                'accountId',
                'providerCustomerId',
                'createdAt',
              ])
              .executeTakeFirstOrThrow()
          ).pipe(
            map(row => ({
              id: encodeId(row.id),
              accountId: encodeId(row.accountId),
              providerCustomerId: row.providerCustomerId,
              createdAt: row.createdAt,
            }))
          )
        }
      )
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
    ).pipe(
      map(row => ({
        id: encodeId(row.id),
        accountId: encodeId(row.accountId),
        providerCustomerId: row.providerCustomerId,
        createdAt: row.createdAt,
      }))
    )
  }

  function createCheckoutSession(
    accountId: string,
    email: string,
    planId: string,
    name?: string
  ): FutureInstance<Error, CheckoutResult> {
    return getOrCreateCustomer(accountId, email, name).pipe(
      chain(() =>
        getPlanById(planId).pipe(
          chain(plan =>
            upsertSubscription({
              accountId: decodeId(accountId)!,
              providerSubscriptionId: `dev_sub_${accountId}`,
              planId: decodeId(plan.id)!,
              status: 'active',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000
              ),
              cancelAtPeriodEnd: false,
              canceledAt: null,
            }).pipe(map(() => ({ transactionId: `dev_txn_${accountId}` })))
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
          active: 1,
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
    ).pipe(
      map(row => ({
        id: encodeId(row.id),
        name: row.name,
        providerPriceId: row.providerPriceId,
        providerProductId: row.providerProductId,
        interval: row.interval,
        active: !!row.active,
        createdAt: row.createdAt,
      }))
    )
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
          enabled: enabled ? 1 : 0,
          limit,
        })
        .returning(['feature', 'enabled', 'limit'])
        .executeTakeFirstOrThrow()
    ).pipe(
      map(row => ({
        feature: row.feature,
        enabled: !!row.enabled,
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
    ).pipe(
      map(row => ({
        id: encodeId(row.id),
        name: row.name,
        providerPriceId: row.providerPriceId,
        providerProductId: row.providerProductId,
        interval: row.interval,
        active: !!row.active,
        createdAt: row.createdAt,
      }))
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
    ).pipe(
      map(row => ({
        id: encodeId(row.id),
        name: row.name,
        providerPriceId: row.providerPriceId,
        providerProductId: row.providerProductId,
        interval: row.interval,
        active: !!row.active,
        createdAt: row.createdAt,
      }))
    )
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
    ).pipe(
      map(rows =>
        rows.map(row => ({
          id: encodeId(row.id),
          name: row.name,
          providerPriceId: row.providerPriceId,
          providerProductId: row.providerProductId,
          interval: row.interval,
          active: !!row.active,
          createdAt: row.createdAt,
        }))
      )
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
    ).pipe(
      map(row => ({
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
      }))
    )
  }

  function changePlan(
    accountId: string,
    newPlanId: string
  ): FutureInstance<Error, BillingSubscription> {
    return getSubscriptionByAccountId(accountId).pipe(
      chain(subscription =>
        attemptQuery(() =>
          database
            .updateTable('billing_subscriptions')
            .set({ planId: decodeId(newPlanId)! })
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
        ).pipe(
          map(row => ({
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
          }))
        )
      )
    )
  }

  function cancelSubscription(
    accountId: string
  ): FutureInstance<Error, BillingSubscription> {
    return getSubscriptionByAccountId(accountId).pipe(
      chain(subscription =>
        attemptQuery(() =>
          database
            .updateTable('billing_subscriptions')
            .set({
              cancelAtPeriodEnd: 1,
            })
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
        ).pipe(
          map(row => ({
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
          }))
        )
      )
    )
  }

  function getPortalLink(
    _accountId: string
  ): FutureInstance<Error, PortalSession> {
    return resolve({ url: 'http://localhost:3000/billing' })
  }

  function getEntitlements(
    accountId: string
  ): FutureInstance<Error, Array<BillingEntitlement>> {
    return getSubscriptionByAccountId(accountId).pipe(
      chain(subscription =>
        attemptQuery(() =>
          database
            .selectFrom('billing_plan_entitlements')
            .select(['feature', 'enabled', 'limit'])
            .where('planId', '=', decodeId(subscription.planId))
            .execute()
        ).pipe(
          map(rows =>
            rows.map(row => ({
              feature: row.feature,
              enabled: !!row.enabled,
              limit: row.limit,
            }))
          )
        )
      )
    )
  }

  function invalidateEntitlementCache(_accountId: string): void {}

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
    createPlan,
    createEntitlement,
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
