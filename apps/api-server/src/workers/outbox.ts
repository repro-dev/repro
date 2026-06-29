import pino from 'pino'
import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database'
import { createS3StorageClient } from '~/modules/storage-s3'
import { createOutboxService } from '~/services/outbox'
import { createOutboxWorker, OutboxWorkerLogger } from '~/services/outboxWorker'
import { createRecordingErrorIndexingService } from '~/services/recordingErrorIndexing'
import {
  createRecordingFinalizationService,
  recordingIndexErrorsDerivedJob,
} from '~/services/recordingFinalization'
import { createDefaultOutboxRegistry } from './outboxRegistry'

const database = createPostgresDatabaseClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL,
})

const storage = createS3StorageClient({
  endpoint: env.STORAGE_ENDPOINT,
  region: env.STORAGE_REGION,
  bucket: env.STORAGE_BUCKET,
  accessKeyId: env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  keyPrefix: env.STORAGE_KEY_PREFIX,
})

const outboxService = createOutboxService(database, {
  defaultMaxAttempts: env.OUTBOX_WORKER_DEFAULT_MAX_ATTEMPTS,
})
const recordingFinalizationService = createRecordingFinalizationService(
  database,
  outboxService,
  { downstreamJobs: [recordingIndexErrorsDerivedJob] }
)
const recordingErrorIndexingService = createRecordingErrorIndexingService(
  database,
  storage
)
const outboxRegistry = createDefaultOutboxRegistry({
  recordingFinalizationService,
  recordingErrorIndexingService,
})
const workerId = `${process.pid}-${Date.now()}`

const pinoOptions: pino.LoggerOptions = {
  level: env.NODE_ENV === 'test' ? 'silent' : 'debug',
}
if (env.NODE_ENV !== 'production') {
  try {
    pinoOptions.transport = { target: 'pino-pretty' }
  } catch {
    // pino-pretty is a devDependency — silently fall back to JSON in CI
  }
}
const pinoLogger = pino(pinoOptions)

function serializeError(error: unknown): {
  name?: string
  message: string
  stack?: string
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return { message: String(error) }
}

function createStructuredLogger(
  base: pino.Logger,
  workerId: string
): OutboxWorkerLogger {
  const child = base.child({ workerId })
  return {
    info(message, metadata) {
      child.info({ ...metadata, event: message }, message)
    },
    warn(message, metadata) {
      child.warn({ ...metadata, event: message }, message)
    },
    debug(message, metadata) {
      child.debug({ ...metadata, event: message }, message)
    },
    error(message, metadata) {
      const enriched = { ...metadata }
      if (enriched.error !== undefined) {
        enriched.error = serializeError(enriched.error)
      }
      child.error({ ...enriched, event: message }, message)
    },
  }
}

const logger = createStructuredLogger(pinoLogger, workerId)

logger.info('outbox worker started', {
  batchSize: env.OUTBOX_WORKER_BATCH_SIZE,
  pollIntervalMs: env.OUTBOX_WORKER_POLL_INTERVAL_MS,
  retryBaseMs: env.OUTBOX_WORKER_RETRY_BASE_MS,
  retryMaxMs: env.OUTBOX_WORKER_RETRY_MAX_MS,
  staleAfterMs: env.OUTBOX_WORKER_STALE_AFTER_MS,
  maxAttempts: env.OUTBOX_WORKER_DEFAULT_MAX_ATTEMPTS,
})

const worker = createOutboxWorker({
  outboxService,
  registry: outboxRegistry,
  config: {
    workerId,
    batchSize: env.OUTBOX_WORKER_BATCH_SIZE,
    pollIntervalMs: env.OUTBOX_WORKER_POLL_INTERVAL_MS,
    baseDelayMs: env.OUTBOX_WORKER_RETRY_BASE_MS,
    maxDelayMs: env.OUTBOX_WORKER_RETRY_MAX_MS,
    staleAfterMs: env.OUTBOX_WORKER_STALE_AFTER_MS,
  },
  logger,
})

const polling = worker.startPolling()

function stop() {
  logger.info('outbox worker shutting down', { workerId })
  polling.stop()
  void database.destroy().finally(() => process.exit(0))
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)
