import { attemptP, both, chain, FutureInstance, map } from 'fluture'
import { sql } from 'kysely'
import { Readable } from 'node:stream'
import { attemptQuery, Database } from '~/modules/database'
import { Storage } from '~/modules/storage'

// Minimal interface required of a Redis client for the health check.
// ioredis.Redis satisfies this interface.
interface PingableClient {
  ping(): Promise<string>
}

interface OK {
  status: 'ok'
}

interface Degraded {
  status: 'degraded'
}

export type HealthStatus = OK | Degraded

export function createHealthService(
  db: Database,
  storage: Storage,
  redisClient?: PingableClient
) {
  function check(): FutureInstance<Error, HealthStatus> {
    const dbCheck = attemptQuery(() => sql`SELECT 1`.execute(db))

    const STORAGE_PATH = '.well-known/health'
    const storageCheck = storage
      .write(STORAGE_PATH, Readable.from(['ok']))
      .pipe(chain(() => storage.read(STORAGE_PATH)))

    const coreCheck = both(dbCheck)(storageCheck)

    if (!redisClient) {
      return coreCheck.pipe(map(() => ({ status: 'ok' }) as const))
    }

    // Soft Redis check: ping failures mark health as degraded, not unavailable.
    // coreCheck failures (db/storage) are still hard failures.
    const redisCheck: FutureInstance<Error, 'ok' | 'degraded'> = attemptP<
      Error,
      'ok' | 'degraded'
    >(() =>
      redisClient
        .ping()
        .then((): 'ok' | 'degraded' => 'ok')
        .catch((): 'ok' | 'degraded' => 'degraded')
    )

    return coreCheck
      .pipe(chain(() => redisCheck))
      .pipe(map(redisStatus => ({ status: redisStatus })))
  }

  return {
    check,
  }
}

export type HealthService = ReturnType<typeof createHealthService>
