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
import { finished } from 'node:stream/promises'
import { attemptQuery, Database } from '~/modules/database'
import { Storage } from '~/modules/storage'
import { OutboxDiagnostics, OutboxService } from './outbox'

// Minimal interface required of a Redis client for the health check.
// ioredis.Redis satisfies this interface.
interface PingableClient {
  ping(): any
}

export type HealthStatus = { status: 'ok' | 'degraded' }

type HealthFuture<T> = FutureInstance<Error, T>

export interface OutboxHealthOptions {
  service: Pick<OutboxService, 'getDiagnostics'>
  staleAfterMs: number
}

export function sanitizeSubsystemCheck(check: SubsystemCheck): SubsystemCheck {
  if (check.status !== 'error') {
    return check
  }

  return {
    status: 'error' as SubsystemStatus,
    error: 'Health check failed',
  }
}

export function sanitizeHealthResult(
  result: HealthCheckResult
): HealthCheckResult {
  const checks: HealthCheckResult['checks'] = {
    database: sanitizeSubsystemCheck(result.checks.database),
    storage: sanitizeSubsystemCheck(result.checks.storage),
  }

  if (result.checks.redis) {
    checks.redis = sanitizeSubsystemCheck(result.checks.redis)
  }

  if (result.checks.outbox) {
    checks.outbox = sanitizeSubsystemCheck(result.checks.outbox)
  }

  return {
    ...result,
    checks,
  }
}

export function createHealthService(
  db: Database,
  storage: Storage,
  redisClient?: PingableClient,
  outbox?: OutboxHealthOptions
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
      .pipe(
        chain(() =>
          storage.read(STORAGE_PATH).pipe(
            chain(readable => {
              return attemptP(async () => {
                readable.resume()

                try {
                  await finished(readable)
                } finally {
                  readable.destroy()
                }
              }).pipe(
                chain(() =>
                  storage
                    .delete(STORAGE_PATH)
                    .pipe(map(() => ({ status: 'ok' as SubsystemStatus })))
                )
              )
            })
          )
        )
      )
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

  function checkOutbox(): HealthFuture<SubsystemCheck> {
    if (!outbox) {
      return attemptP(() =>
        Promise.resolve({ status: 'ok' as SubsystemStatus })
      )
    }

    const start = Date.now()
    return outbox.service
      .getDiagnostics({ staleAfterMs: outbox.staleAfterMs })
      .pipe(
        map(
          (diagnostics: OutboxDiagnostics): SubsystemCheck => ({
            status:
              diagnostics.failed > 0 || diagnostics.staleRunning > 0
                ? 'degraded'
                : 'ok',
            latencyMs: Date.now() - start,
            details: { ...diagnostics },
          })
        )
      )
      .pipe(
        coalesce(
          (): SubsystemCheck => ({
            status: 'degraded' as SubsystemStatus,
            latencyMs: Date.now() - start,
            error: 'Health check failed',
          })
        )(check => check)
      )
  }

  function computeOverallStatus(
    checks: HealthCheckResult['checks']
  ): OverallStatus {
    const coreChecks = [checks.database, checks.storage]

    if (coreChecks.some(check => check.status === 'error')) {
      return 'unhealthy'
    }

    if (coreChecks.some(check => check.status === 'degraded')) {
      return 'degraded'
    }

    const redisCheck = checks.redis
    if (redisCheck && redisCheck.status !== 'ok') {
      return 'degraded'
    }

    const outboxCheck = checks.outbox
    if (outboxCheck && outboxCheck.status !== 'ok') {
      return 'degraded'
    }

    return 'ok'
  }

  function buildHealthResult(
    checks: HealthCheckResult['checks']
  ): HealthCheckResult {
    return sanitizeHealthResult({
      status: computeOverallStatus(checks),
      timestamp: new Date().toISOString(),
      checks,
    })
  }

  function checkDetailed(): HealthFuture<HealthCheckResult> {
    const dbCheck = checkDb()
    const storageCheck = checkStorage()

    const coreChecks: HealthFuture<[SubsystemCheck, SubsystemCheck]> =
      both(dbCheck)(storageCheck)

    if (redisClient && outbox) {
      return coreChecks.pipe(
        chain(([db, storage]) =>
          both(checkRedis())(checkOutbox()).pipe(
            map(([redis, outboxCheck]) =>
              buildHealthResult({
                database: db,
                storage,
                redis,
                outbox: outboxCheck,
              })
            )
          )
        )
      )
    }

    if (redisClient) {
      return coreChecks.pipe(
        chain(([db, storage]) =>
          checkRedis().pipe(
            map(redis => buildHealthResult({ database: db, storage, redis }))
          )
        )
      )
    }

    if (outbox) {
      return coreChecks.pipe(
        chain(([db, storage]) =>
          checkOutbox().pipe(
            map(outboxCheck =>
              buildHealthResult({ database: db, storage, outbox: outboxCheck })
            )
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
    computeOverallStatus,
    check,
    checkDetailed,
    sanitizeHealthResult,
  }
}

export interface HealthService {
  check: () => HealthFuture<HealthStatus>
  checkDetailed: () => HealthFuture<HealthCheckResult>
}
