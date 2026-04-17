import type {
  HealthCheckResult,
  OverallStatus,
  SubsystemCheck,
  SubsystemStatus,
} from '@repro/domain'
import type { FutureInstance } from 'fluture'
import { attemptP, both, chain, coalesce, map } from 'fluture'
import { sql } from 'kysely'
import { Readable } from 'node:stream'
import { attemptQuery, Database } from '~/modules/database'
import { Storage } from '~/modules/storage'

// Minimal interface required of a Redis client for the health check.
// ioredis.Redis satisfies this interface.
interface PingableClient {
  ping(): any
}

export type HealthStatus = { status: 'ok' | 'degraded' }

type HealthFuture<T> = FutureInstance<Error, T>

export function createHealthService(
  db: Database,
  storage: Storage,
  redisClient?: PingableClient
) {
  function checkDb(): HealthFuture<SubsystemCheck> {
    return attemptQuery(() => sql`SELECT 1`.execute(db)).pipe(
      coalesce(
        (): SubsystemCheck => ({
          status: 'error' as SubsystemStatus,
          error: 'Health check failed',
        })
      )(() => ({ status: 'ok' as SubsystemStatus }))
    )
  }

  function checkStorage(): HealthFuture<SubsystemCheck> {
    const STORAGE_PATH = '.well-known/health'
    return storage
      .write(STORAGE_PATH, Readable.from(['ok']))
      .pipe(chain(() => storage.exists(STORAGE_PATH)))
      .pipe(
        coalesce(
          (): SubsystemCheck => ({
            status: 'error' as SubsystemStatus,
            error: 'Health check failed',
          })
        )(() => ({ status: 'ok' as SubsystemStatus }))
      )
  }

  function checkRedis(): HealthFuture<SubsystemCheck> {
    if (!redisClient) {
      // Should not be called when redisClient is absent; caller gates this.
      return attemptP(() =>
        Promise.resolve({ status: 'degraded' as SubsystemStatus })
      )
    }
    const start = Date.now()
    return attemptP(() =>
      redisClient
        .ping()
        .then(
          (): SubsystemCheck => ({
            status: 'ok' as SubsystemStatus,
            latencyMs: Date.now() - start,
          })
        )
        .catch(
          (): SubsystemCheck => ({
            status: 'degraded' as SubsystemStatus,
            latencyMs: Date.now() - start,
            error: 'Health check failed',
          })
        )
    )
  }

  function computeOverallStatus(
    checks: HealthCheckResult['checks']
  ): OverallStatus {
    const dbOk = checks.database.status === 'ok'
    const storageOk = checks.storage.status === 'ok'

    if (
      checks.database.status === 'error' ||
      checks.storage.status === 'error'
    ) {
      return 'unhealthy'
    }

    if (!dbOk || !storageOk) {
      return 'degraded'
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

  function checkDetailed(): HealthFuture<HealthCheckResult> {
    const dbCheck = checkDb()
    const storageCheck = checkStorage()

    const coreChecks: HealthFuture<[SubsystemCheck, SubsystemCheck]> =
      both(dbCheck)(storageCheck)

    if (redisClient) {
      return coreChecks.pipe(
        chain(([db, storage]) =>
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

  function check(): HealthFuture<HealthStatus> {
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

export interface HealthService {
  check: () => HealthFuture<HealthStatus>
  checkDetailed: () => HealthFuture<HealthCheckResult>
}
