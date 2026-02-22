import { FutureInstance, chain, map, resolve } from 'fluture'
import { Cache } from '~/modules/cache'
import { createLRUCache } from '~/modules/cache-lru'
import { Database, attemptQuery, decodeId } from '~/modules/database'
import { BillingEntitlement } from '~/services/billing'

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const

const ENTITLEMENT_CACHE_MAX_SIZE = 1000
const ENTITLEMENT_CACHE_TTL_MS = 60_000

export function createBillingEntitlementService(database: Database) {
  const cache: Cache<Array<BillingEntitlement>> = createLRUCache({
    maxSize: ENTITLEMENT_CACHE_MAX_SIZE,
    defaultTTL: ENTITLEMENT_CACHE_TTL_MS,
  })

  function getEntitlements(
    accountId: string
  ): FutureInstance<Error, Array<BillingEntitlement>> {
    return cache.get(accountId).pipe(
      chain(cached => {
        if (cached !== undefined) {
          return resolve(cached)
        }

        return fetchEntitlements(accountId).pipe(
          chain(entitlements =>
            cache.set(accountId, entitlements).pipe(map(() => entitlements))
          )
        )
      })
    )
  }

  function fetchEntitlements(
    accountId: string
  ): FutureInstance<Error, Array<BillingEntitlement>> {
    const decodedAccountId = decodeId(accountId)

    return attemptQuery(() =>
      database
        .selectFrom('billing_subscriptions')
        .innerJoin(
          'billing_plan_entitlements',
          'billing_plan_entitlements.planId',
          'billing_subscriptions.planId'
        )
        .select([
          'billing_plan_entitlements.feature',
          'billing_plan_entitlements.enabled',
          'billing_plan_entitlements.limit',
        ])
        .where('billing_subscriptions.accountId', '=', decodedAccountId)
        .where('billing_subscriptions.status', 'in', [...ACTIVE_STATUSES])
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
  }

  function invalidateEntitlementCache(
    accountId: string
  ): FutureInstance<Error, void> {
    return cache.delete(accountId).pipe(map(() => undefined))
  }

  return {
    getEntitlements,
    invalidateEntitlementCache,
  }
}

export type BillingEntitlementService = ReturnType<
  typeof createBillingEntitlementService
>
