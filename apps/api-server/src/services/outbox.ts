import { FutureInstance, attemptP, promise } from 'fluture'
import { Kysely, Transaction, sql } from 'kysely'
import {
  Database,
  OutboxJobRow,
  OutboxJson,
  OutboxLastError,
  attemptQuery,
} from '~/modules/database'
import { Schema } from '~/modules/database/schema'

export type OutboxPayloadMap = Record<string, OutboxJson>

export type OutboxHandler<Payload extends OutboxJson> = (
  payload: Payload,
  job: OutboxJobRow
) => FutureInstance<Error, void>

export type OutboxRegistry<Jobs extends OutboxPayloadMap> = {
  readonly [Type in keyof Jobs & string]: OutboxHandler<Jobs[Type]>
}

export type AnyOutboxRegistry = Record<string, OutboxHandler<OutboxJson>>

export function createOutboxRegistry<Jobs extends OutboxPayloadMap>(
  registry: OutboxRegistry<Jobs>
): OutboxRegistry<Jobs> {
  return registry
}

export interface EnqueueParams<
  Jobs extends OutboxPayloadMap,
  Type extends keyof Jobs & string,
> {
  type: Type
  payload: Jobs[Type]
  idempotencyKey?: string
  maxAttempts?: number
  runAfter?: Date
}

export interface EnqueueResult {
  job: OutboxJobRow
  deduplicated: boolean
}

export interface ClaimPendingJobsParams {
  workerId: string
  batchSize: number
  staleAfterMs?: number
  now?: Date
}

export interface RetryConfig {
  baseDelayMs: number
  maxDelayMs: number
}

export interface OutboxDiagnostics {
  pending: number
  running: number
  failed: number
  staleRunning: number
}

export interface OutboxDiagnosticsParams {
  staleAfterMs: number
  now?: Date
}

type OutboxDatabase = Kysely<Schema> | Transaction<Schema>

export interface OutboxServiceConfig {
  defaultMaxAttempts?: number
}

function serializeLastError(error: unknown): OutboxLastError {
  // @repro/api-server does not currently depend on serialize-error; keep this
  // narrow JSON-safe shape local until the package owns that dependency.
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return { message: String(error) }
}

export function calculateRetryRunAfter(
  attempt: number,
  config: RetryConfig,
  now: Date = new Date()
): Date {
  const exponent = Math.max(0, attempt - 1)
  const delayMs = Math.min(
    config.maxDelayMs,
    config.baseDelayMs * 2 ** exponent
  )
  return new Date(now.getTime() + delayMs)
}

export function createOutboxService<
  Jobs extends OutboxPayloadMap = Record<string, OutboxJson>,
>(database: Database, config: OutboxServiceConfig = {}) {
  const defaultMaxAttempts = config.defaultMaxAttempts ?? 3

  async function insertJob<Type extends keyof Jobs & string>(
    db: OutboxDatabase,
    params: EnqueueParams<Jobs, Type>
  ): Promise<EnqueueResult> {
    const values = {
      type: params.type,
      payload: params.payload,
      idempotencyKey: params.idempotencyKey ?? null,
      maxAttempts: params.maxAttempts ?? defaultMaxAttempts,
      runAfter: params.runAfter ?? new Date(),
    }

    if (!params.idempotencyKey) {
      const job = await db
        .insertInto('outbox_jobs')
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow()
      return { job, deduplicated: false }
    }

    const inserted = await db
      .insertInto('outbox_jobs')
      .values(values)
      .onConflict(oc =>
        oc
          .column('idempotencyKey')
          .where('idempotencyKey', 'is not', null)
          .doNothing()
      )
      .returningAll()
      .executeTakeFirst()

    if (inserted) {
      return { job: inserted, deduplicated: false }
    }

    const existing = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .where('idempotencyKey', '=', params.idempotencyKey)
      .executeTakeFirstOrThrow()

    return { job: existing, deduplicated: true }
  }

  function enqueue<Type extends keyof Jobs & string>(
    params: EnqueueParams<Jobs, Type>
  ): FutureInstance<Error, EnqueueResult> {
    return attemptQuery(() => insertJob(database, params))
  }

  function enqueueWithTransaction<Type extends keyof Jobs & string>(
    trx: Transaction<Schema>,
    params: EnqueueParams<Jobs, Type>
  ): FutureInstance<Error, EnqueueResult> {
    return attemptQuery(() => insertJob(trx, params))
  }

  function withOutboxTransaction<T>(
    action: (trx: Transaction<Schema>) => FutureInstance<Error, T>
  ): FutureInstance<Error, T> {
    return attemptP(() =>
      database.transaction().execute(async trx => promise(action(trx)))
    )
  }

  function claimPendingJobs({
    workerId,
    batchSize,
    staleAfterMs,
    now = new Date(),
  }: ClaimPendingJobsParams): FutureInstance<Error, Array<OutboxJobRow>> {
    const staleBefore = staleAfterMs
      ? new Date(now.getTime() - staleAfterMs)
      : null

    return attemptQuery(() =>
      database.transaction().execute(async trx => {
        const claimable = await sql<{ id: number }>`
          SELECT "id"
          FROM "outbox_jobs"
          WHERE (
            "status" = 'pending'
            AND "runAfter" <= ${now}
          ) OR (
            ${staleBefore}::timestamptz IS NOT NULL
            AND "status" = 'running'
            AND "lockedAt" <= ${staleBefore}
            AND "attempts" < "maxAttempts"
          )
          ORDER BY "runAfter" ASC, "id" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        `.execute(trx)

        const ids = claimable.rows.map(row => row.id)

        if (ids.length === 0) {
          return []
        }

        return trx
          .updateTable('outbox_jobs')
          .set({
            status: 'running',
            attempts: sql<number>`"attempts" + 1`,
            lockedAt: now,
            lockedBy: workerId,
            lastError: null,
          })
          .where('id', 'in', ids)
          .returningAll()
          .execute()
      })
    )
  }

  function markJobSucceeded(job: OutboxJobRow): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      await database
        .updateTable('outbox_jobs')
        .set({
          status: 'succeeded',
          lockedAt: null,
          lockedBy: null,
        })
        .where('id', '=', job.id)
        .execute()
    })
  }

  function markJobFailed(
    job: OutboxJobRow,
    error: unknown,
    retryConfig: RetryConfig,
    now: Date = new Date()
  ): FutureInstance<Error, OutboxJobRow> {
    const lastError = serializeLastError(error)
    const hasAttemptsRemaining = job.attempts < job.maxAttempts
    const nextStatus = hasAttemptsRemaining ? 'pending' : 'failed'
    const runAfter = hasAttemptsRemaining
      ? calculateRetryRunAfter(job.attempts, retryConfig, now)
      : job.runAfter

    return attemptQuery(() =>
      database
        .updateTable('outbox_jobs')
        .set({
          status: nextStatus,
          runAfter,
          lockedAt: null,
          lockedBy: null,
          lastError,
        })
        .where('id', '=', job.id)
        .returningAll()
        .executeTakeFirstOrThrow()
    )
  }

  function getDiagnostics({
    staleAfterMs,
    now = new Date(),
  }: OutboxDiagnosticsParams): FutureInstance<Error, OutboxDiagnostics> {
    const staleBefore = new Date(now.getTime() - staleAfterMs)

    async function countStatus(
      status: OutboxJobRow['status']
    ): Promise<number> {
      const row = await database
        .selectFrom('outbox_jobs')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .where('status', '=', status)
        .executeTakeFirstOrThrow()

      return Number(row.count)
    }

    return attemptQuery(async () => {
      const [pending, running, failed, staleRunningRow] = await Promise.all([
        countStatus('pending'),
        countStatus('running'),
        countStatus('failed'),
        database
          .selectFrom('outbox_jobs')
          .select(({ fn }) => fn.count<number>('id').as('count'))
          .where('status', '=', 'running')
          .where('lockedAt', '<=', staleBefore)
          .executeTakeFirstOrThrow(),
      ])

      return {
        pending,
        running,
        failed,
        staleRunning: Number(staleRunningRow.count),
      }
    })
  }

  return {
    enqueue,
    enqueueWithTransaction,
    withOutboxTransaction,
    claimPendingJobs,
    markJobSucceeded,
    markJobFailed,
    getDiagnostics,
  }
}

export type OutboxService = ReturnType<typeof createOutboxService>
