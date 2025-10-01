import {
  FutureInstance,
  bichain,
  chain,
  map,
  reject,
  resolve,
  swap,
} from 'fluture'
import {
  Database,
  attemptQuery,
  decodeId,
  withEncodedId,
} from '~/modules/database'
import { FeatureGate } from '~/types/featureGate'
import { isNotFound, notFound, resourceConflict } from '~/utils/errors'

export function createFeatureGateService(database: Database) {
  function getFeatureGateByName(
    name: string
  ): FutureInstance<Error, FeatureGate> {
    return attemptQuery(() => {
      return database
        .selectFrom('feature_gates')
        .select(['id', 'name', 'description', 'active', 'createdAt'])
        .where('name', '=', name)
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(
      map(row => ({
        ...withEncodedId(row),
        active: !!row.active,
        createdAt: row.createdAt,
      }))
    )
  }

  function createFeatureGate(
    name: string,
    description: string
  ): FutureInstance<
    Error,
    {
      id: string
      name: string
      description: string
      active: number
      createdAt: string
    }
  > {
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
              active: 1,
            })
            .returning(['id', 'name', 'description', 'active', 'createdAt'])
            .executeTakeFirstOrThrow()
        }).pipe(
          map(row => ({
            ...withEncodedId(row),
            createdAt: row.createdAt.toISOString(),
          }))
        )
      )
    )
  }

  function getFeatureGateById(id: string): FutureInstance<
    Error,
    {
      id: string
      name: string
      description: string
      active: number
      createdAt: string
    }
  > {
    return attemptQuery(() => {
      return database
        .selectFrom('feature_gates')
        .select(['id', 'name', 'description', 'active', 'createdAt'])
        .where('id', '=', decodeId(id))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(
      map(row => ({
        ...withEncodedId(row),
        createdAt: row.createdAt.toISOString(),
      }))
    )
  }

  function listFeatureGates(order: 'asc' | 'desc' = 'asc'): FutureInstance<
    Error,
    Array<{
      id: string
      name: string
      description: string
      active: number
      createdAt: string
    }>
  > {
    return attemptQuery(() => {
      return database
        .selectFrom('feature_gates')
        .select(['id', 'name', 'description', 'active', 'createdAt'])
        .orderBy(`name ${order}`)
        .execute()
    }).pipe(
      map(rows =>
        rows.map(row => ({
          ...withEncodedId(row),
          createdAt: row.createdAt.toISOString(),
        }))
      )
    )
  }

  function updateFeatureGate(
    id: string,
    updates: {
      name?: string
      description?: string
      active?: number
    }
  ): FutureInstance<
    Error,
    {
      id: string
      name: string
      description: string
      active: number
      createdAt: string
    }
  > {
    const { name, description, active } = updates

    const conflictError = resourceConflict(
      'Feature gate with this name already exists'
    )

    const checkNameConflict: FutureInstance<Error, void> = name
      ? getFeatureGateByName(name).pipe(
          bichain<Error, Error, void>(error =>
            isNotFound(error) ? resolve(undefined) : reject(error)
          )(gate =>
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
              ...(active !== undefined && { active }),
            })
            .where('id', '=', decodeId(id))
            .returning(['id', 'name', 'description', 'active', 'createdAt'])

          return query.executeTakeFirstOrThrow(() => notFound())
        }).pipe(
          map(row => ({
            ...withEncodedId(row),
            createdAt: row.createdAt.toISOString(),
          }))
        )
      )
    )
  }

  function removeFeatureGate(id: string): FutureInstance<Error, void> {
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
    updateFeatureGate,
    removeFeatureGate,
  }
}

export type FeatureGateService = ReturnType<typeof createFeatureGateService>
