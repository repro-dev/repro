import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database'
import { createOutboxService } from '~/services/outbox'
import { createOutboxWorker } from '~/services/outboxWorker'
import { outboxRegistry } from './outboxRegistry'

const database = createPostgresDatabaseClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL,
})

const outboxService = createOutboxService(database, {
  defaultMaxAttempts: env.OUTBOX_WORKER_DEFAULT_MAX_ATTEMPTS,
})
const workerId = `${process.pid}-${Date.now()}`

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
  logger: console,
})

const polling = worker.startPolling()

function stop() {
  polling.stop()
  void database.destroy().finally(() => process.exit(0))
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)
