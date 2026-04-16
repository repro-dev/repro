import type {
  HealthCheckResult,
  OverallStatus,
  SubsystemCheck,
  SubsystemStatus,
} from '@repro/domain'
import { attemptP, both, chain, coalesce, FutureInstance, map } from 'fluture'
import { sql } from 'kysely'
import { Readable } from 'node:stream'
import { attemptQuery, Database } from '~/modules/database'
import { Storage } from '~/modules/storage'

// Minimal interface required of a Redis client for the health check.
// ioredis.Redis satisfies this interface.
interface PingableClient {
  ping(): Promise<string>
}

export type HealthStatus = { status: 'ok' | 'degraded' }

export function createHealthService(
  db: Database,
  storage: Storage,
  redisClient?: PingableClient
) {
  function checkDb(): FutureInstance<Error, SubsystemCheck> {
    return attemptQuery(() => sql`SELECT 1`.execute(db)).pipe(
      coalesce<Error, SubsystemCheck>(
        (err: Error): SubsystemCheck => ({
          status: 'error' as SubsystemStatus,
          error: err.message,
        })
      )(() => ({ status: 'ok' as SubsystemStatus }))
    )
  }

  function checkStorage(): FutureInstance<Error, SubsystemCheck> {
    const STORAGE_PATH = '.well-known/health'
    return storage
      .write(STORAGE_PATH, Readable.from(['ok']))
      .pipe(chain(() => storage.read(STORAGE_PATH)))
      .pipe(
        coalesce<Error, SubsystemCheck>(
          (err: Error): SubsystemCheck => ({
            status: 'error' as SubsystemStatus,
            error: err.message,
          })
        )(() => ({ status: 'ok' as SubsystemStatus }))
      )
  }

  function checkRedis(): FutureInstance<Error, SubsystemCheck> {
    if (!redisClient) {
      // Should not be called when redisClient is absent; caller gates this.
      return attemptP<Error, SubsystemCheck>(() =>
        Promise.resolve({ status: 'degraded' as SubsystemStatus })
      )
    }
    const start = Date.now()
    return attemptP<Error, SubsystemCheck>(() =>
      redisClient
        .ping()
        .then(
          (): SubsystemCheck => ({
            status: 'ok' as SubsystemStatus,
            latencyMs: Date.now() - start,
          })
        )
        .catch(
          (err: unknown): SubsystemCheck => ({
            status: 'degraded' as SubsystemStatus,
            latencyMs: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          })
        )
    )
  }

  function computeOverallStatus(
    checks: HealthCheckResult['checks']
  ): OverallStatus {
    const dbOk = checks.database.status === 'ok'
    const storageOk = checks.storage.status === 'ok'

    if (!dbOk || !storageOk) {
      return 'unhealthy'
    }

    const redisCheck = checks.redis
    if (redisCheck && redisCheck.status !== 'ok') {
      return 'degraded'
    }

    return 'ok'
  }

  function buildHealthResult(
    checks: HealthCheckResult['checks']
  ): HealthCheckResult {
    return {
      status: computeOverallStatus(checks),
      timestamp: new Date().toISOString(),
      checks,
    }
  }

  function checkDetailed(): FutureInstance<Error, HealthCheckResult> {
    const dbCheck = checkDb()
    const storageCheck = checkStorage()

    const coreChecks = both(dbCheck)(storageCheck)

    if (redisClient) {
      return coreChecks.pipe(
        chain(
          ([db, storage]): FutureInstance<Error, HealthCheckResult> =>
            checkRedis().pipe(
              map(redis => buildHealthResult({ database: db, storage, redis }))
            )
        )
      )
    }

    return coreChecks.pipe(
      map(
        ([db, storage]): HealthCheckResult =>
          buildHealthResult({ database: db, storage })
      )
    )
  }

  function check(): FutureInstance<Error, HealthStatus> {
    return checkDetailed().pipe(
      map(result => {
        // Map overall status to the legacy ok/degraded shape.
        // 'unhealthy' is only returned when a core subsystem is down;
        // in the legacy API, unhealthy maps to degraded for backward compat.
        const legacyStatus: 'ok' | 'degraded' =
          result.status === 'ok' ? 'ok' : 'degraded'
        return { status: legacyStatus }
      })
    )
  }

  return {
    check,
    checkDetailed,
  }
}

export type HealthService = ReturnType<typeof createHealthService>
