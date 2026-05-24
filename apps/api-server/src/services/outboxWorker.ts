import { FutureInstance, attemptP, promise } from 'fluture'
import { OutboxJobRow, OutboxJson } from '~/modules/database'
import { ClaimPendingJobsParams, OutboxHandler, RetryConfig } from './outbox'

export interface OutboxWorkerConfig extends RetryConfig {
  workerId: string
  batchSize: number
  pollIntervalMs: number
  staleAfterMs: number
}

export interface OutboxWorkerRunResult {
  claimed: number
  succeeded: number
  retried: number
  failed: number
}

export interface OutboxWorkerLogger {
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(message: string, metadata?: Record<string, unknown>): void
}

export interface OutboxWorkerService {
  claimPendingJobs(
    params: ClaimPendingJobsParams
  ): FutureInstance<Error, Array<OutboxJobRow>>
  markJobSucceeded(job: OutboxJobRow): FutureInstance<Error, void>
  markJobFailed(
    job: OutboxJobRow,
    error: unknown,
    retryConfig: RetryConfig
  ): FutureInstance<Error, OutboxJobRow>
}

export interface CreateOutboxWorkerParams {
  outboxService: OutboxWorkerService
  registry: Record<string, OutboxHandler<OutboxJson>>
  config: OutboxWorkerConfig
  logger?: OutboxWorkerLogger
}

const defaultLogger: OutboxWorkerLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
}

function missingHandlerError(job: OutboxJobRow): Error {
  return new Error(`No outbox handler registered for job type "${job.type}"`)
}

export function createOutboxWorker({
  outboxService,
  registry,
  config,
  logger = defaultLogger,
}: CreateOutboxWorkerParams) {
  async function processJob(job: OutboxJobRow): Promise<{
    succeeded: boolean
    retried: boolean
    failed: boolean
  }> {
    const startedAt = Date.now()
    logger.info('outbox job started', {
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
      workerId: config.workerId,
    })

    const handler = registry[job.type]

    try {
      if (!handler) {
        throw missingHandlerError(job)
      }

      await promise(handler(job.payload, job))
      await promise(outboxService.markJobSucceeded(job))
      logger.info('outbox job succeeded', {
        jobId: job.id,
        type: job.type,
        durationMs: Date.now() - startedAt,
      })
      return { succeeded: true, retried: false, failed: false }
    } catch (error) {
      const updated = await promise(
        outboxService.markJobFailed(job, error, config)
      )
      const errorSummary =
        error instanceof Error ? error.message : String(error)

      if (updated.status === 'pending') {
        logger.warn('outbox job retry scheduled', {
          jobId: job.id,
          type: job.type,
          attempt: job.attempts,
          runAfter: updated.runAfter.toISOString(),
          error: errorSummary,
        })
        return { succeeded: false, retried: true, failed: false }
      }

      logger.error('outbox job failed terminally', {
        jobId: job.id,
        type: job.type,
        attempts: updated.attempts,
        error: errorSummary,
      })
      return { succeeded: false, retried: false, failed: true }
    }
  }

  function runOnce(): FutureInstance<Error, OutboxWorkerRunResult> {
    return attemptP(async () => {
      const jobs = await promise(
        outboxService.claimPendingJobs({
          workerId: config.workerId,
          batchSize: config.batchSize,
          staleAfterMs: config.staleAfterMs,
        })
      )

      const result: OutboxWorkerRunResult = {
        claimed: jobs.length,
        succeeded: 0,
        retried: 0,
        failed: 0,
      }

      for (const job of jobs) {
        const outcome = await processJob(job)
        result.succeeded += outcome.succeeded ? 1 : 0
        result.retried += outcome.retried ? 1 : 0
        result.failed += outcome.failed ? 1 : 0
      }

      return result
    })
  }

  function startPolling(): { stop(): void } {
    let stopped = false
    let timer: NodeJS.Timeout | undefined

    const poll = () => {
      if (stopped) {
        return
      }

      promise(runOnce())
        .catch(error => {
          logger.error('outbox polling failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        })
        .finally(() => {
          if (!stopped) {
            timer = setTimeout(poll, config.pollIntervalMs)
          }
        })
    }

    poll()

    return {
      stop() {
        stopped = true
        if (timer) {
          clearTimeout(timer)
        }
      },
    }
  }

  return { runOnce, startPolling }
}
