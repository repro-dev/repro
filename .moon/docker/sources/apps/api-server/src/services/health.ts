import { both, chain, FutureInstance, map } from 'fluture'
import { sql } from 'kysely'
import { Readable } from 'node:stream'
import { attemptQuery, Database } from '~/modules/database'
import { Storage } from '~/modules/storage'

interface OK {
  status: 'ok'
}

export function createHealthService(db: Database, storage: Storage) {
  function check(): FutureInstance<Error, OK> {
    const dbCheck = attemptQuery(() => sql`SELECT 1`.execute(db))

    const STORAGE_PATH = '.well-known/health'
    const storageCheck = storage
      .write(STORAGE_PATH, Readable.from(['ok']))
      .pipe(chain(() => storage.read(STORAGE_PATH)))

    return both(dbCheck)(storageCheck).pipe(
      map(() => ({ status: 'ok' }) as const)
    )
  }

  return {
    check,
  }
}

export type HealthService = ReturnType<typeof createHealthService>
