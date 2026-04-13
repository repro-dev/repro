import { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import {
  FutureInstance,
  bichain,
  chain,
  fork,
  go,
  map,
  reject,
  resolve,
  swap,
} from 'fluture'
import { Env } from '~/config/createEnv'
import { SystemConfig, defaultSystemConfig } from '~/config/system'
import { Database, attemptQuery, decodeId } from '~/modules/database'
import { asFeatureGate } from '~/modules/database/schema/FeatureGateTable'
import { AccountService } from '~/services/account'
import { BillingEntitlement, BillingService } from '~/services/billing'
import { FeatureGate } from '~/types/featureGate'
import {
  isNotFound,
  notFound,
  permissionDenied,
  resourceConflict,
} from '~/utils/errors'
import { getCurrentUserAccount } from '~/utils/request'
import { createResponseUtils } from '~/utils/response'

export function createFeatureGateService(database: Database) {
  function getFeatureGateByName(
    name: string
  ): FutureInstance<Error, FeatureGate> {
    return attemptQuery(() => {
      return database
        .selectFrom('feature_gates')
        .select(['id', 'name', 'description', 'enabled', 'createdAt'])
        .where('name', '=', name)
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(asFeatureGate))
  }

  function createFeatureGate(
    name: string,
    description: string
  ): FutureInstance<Error, FeatureGate> {
    const existingFeatureGate = getFeatureGateByName(name)
      .pipe(map(() => resourceConflict('Feature gate already exists')))
      .pipe(swap)

    return existingFeatureGate.pipe(
      chain(() =>
        attemptQuery(() => {
          return database
            .insertInto('feature_gates')
            .values({
              name,
              description,
              enabled: false,
            })
            .returning(['id', 'name', 'description', 'enabled', 'createdAt'])
            .executeTakeFirstOrThrow()
        }).pipe(map(asFeatureGate))
      )
    )
  }

  function getFeatureGateById(id: string): FutureInstance<Error, FeatureGate> {
    return attemptQuery(() => {
      return database
        .selectFrom('feature_gates')
        .select(['id', 'name', 'description', 'enabled', 'createdAt'])
        .where('id', '=', decodeId(id))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(asFeatureGate))
  }

  function listFeatureGates(
    order: 'asc' | 'desc' = 'asc'
  ): FutureInstance<Error, Array<FeatureGate>> {
    return attemptQuery(() => {
      return database
        .selectFrom('feature_gates')
        .select(['id', 'name', 'description', 'enabled', 'createdAt'])
        .orderBy(`name ${order}`)
        .execute()
    }).pipe(map(rows => rows.map(asFeatureGate)))
  }

  function listEnabledFeatureGates(
    order: 'asc' | 'desc' = 'asc'
  ): FutureInstance<Error, Array<FeatureGate>> {
    return attemptQuery(() => {
      return database
        .selectFrom('feature_gates')
        .select(['id', 'name', 'description', 'enabled', 'createdAt'])
        .where('enabled', '=', true)
        .orderBy(`name ${order}`)
        .execute()
    }).pipe(map(rows => rows.map(asFeatureGate)))
  }

  function updateFeatureGate(
    id: string,
    updates: {
      name?: string
      description?: string
      enabled?: boolean
    }
  ): FutureInstance<Error, FeatureGate> {
    const { name, description, enabled } = updates

    const conflictError = resourceConflict(
      'Feature gate with this name already exists'
    )

    const checkNameConflict: FutureInstance<Error, undefined> = name
      ? getFeatureGateByName(name).pipe(
          bichain((error: Error) =>
            isNotFound(error) ? resolve(undefined) : reject(error)
          )((gate: FeatureGate) =>
            gate.id !== id ? reject(conflictError) : resolve(undefined)
          )
        )
      : resolve(undefined)

    return checkNameConflict.pipe(
      chain(() =>
        attemptQuery(() => {
          let query = database
            .updateTable('feature_gates')
            .set({
              ...(name && { name }),
              ...(description !== undefined && { description }),
              ...(enabled !== undefined && { enabled }),
            })
            .where('id', '=', decodeId(id))
            .returning(['id', 'name', 'description', 'enabled', 'createdAt'])

          return query.executeTakeFirstOrThrow(() => notFound())
        }).pipe(map(asFeatureGate))
      )
    )
  }

  function removeFeatureGate(id: string): FutureInstance<Error, undefined> {
    return attemptQuery(() => {
      return database
        .deleteFrom('feature_gates')
        .where('id', '=', decodeId(id))
        .executeTakeFirst()
    }).pipe(
      chain(result =>
        result.numDeletedRows === 0n ? reject(notFound()) : resolve(undefined)
      )
    )
  }

  return {
    createFeatureGate,
    getFeatureGateById,
    listFeatureGates,
    listEnabledFeatureGates,
    updateFeatureGate,
    removeFeatureGate,
  }
}

export type FeatureGateService = ReturnType<typeof createFeatureGateService>

// Returns a factory that produces a Fastify preHandler hook enforcing
// entitlement-based feature gates. When BILLING_STUBBED=true, every gate
// passes immediately so local dev is never blocked by missing entitlement data.
export function createFeatureGateMiddleware(
  billingService: BillingService,
  accountService: AccountService,
  env: Env,
  config: SystemConfig = defaultSystemConfig
): (feature: string) => preHandlerHookHandler {
  const { respondWithError } = createResponseUtils(config)

  return function requireFeature(feature: string): preHandlerHookHandler {
    return function (req: FastifyRequest, res: FastifyReply, done) {
      if (env.BILLING_STUBBED) {
        done()
        return
      }

      fork((error: Error) => respondWithError(res, error))(entitled => {
        if (entitled) {
          done()
        } else {
          respondWithError(
            res,
            permissionDenied('Feature not available on your plan')
          )
        }
      })(
        go(function* () {
          const { account } = yield getCurrentUserAccount(req, accountService)
          const entitlements: Array<BillingEntitlement> =
            yield billingService.getEntitlements(account.id)
          return entitlements.some(
            (e: BillingEntitlement) => e.feature === feature && e.enabled
          )
        })
      )
    }
  }
}
