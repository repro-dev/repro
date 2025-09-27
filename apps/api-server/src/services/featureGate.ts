import { FutureInstance, chain, map, swap } from 'fluture'
import { Database, attemptQuery, withEncodedId } from '~/modules/database'
import { resourceConflict } from '~/utils/errors'

export function createFeatureGateService(database: Database) {
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
    const existingFeatureGate = attemptQuery(async () => {
      return database
        .selectFrom('feature_gates')
        .select('id')
        .where('name', '=', name)
        .executeTakeFirstOrThrow()
    })
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

  return {
    createFeatureGate,
  }
}

export type FeatureGateService = ReturnType<typeof createFeatureGateService>

