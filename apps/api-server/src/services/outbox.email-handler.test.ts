import expect from 'expect'
import { promise, reject, resolve } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Database, OutboxJson } from '~/modules/database'
import { setUpTestDatabase } from '~/testing/database'
import { EMAIL_SEND_JOB_TYPE } from '~/workers/outboxRegistry'
import { createOutboxService } from './outbox'
import { createOutboxWorker } from './outboxWorker'

type TestJobs = {
  [EMAIL_SEND_JOB_TYPE]: {
    message: OutboxJson
    emailKind: string
  }
}

function workerConfig() {
  return {
    workerId: 'worker-test',
    batchSize: 10,
    pollIntervalMs: 1000,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    staleAfterMs: 300000,
  }
}

describe('Services > Outbox > email.send handler', () => {
  let db: Database
  let close: () => Promise<void>

  before(async () => {
    const harness = await setUpTestDatabase()
    db = harness.db
    close = harness.close
  })

  beforeEach(async () => {
    await db.deleteFrom('outbox_jobs').execute()
  })

  after(async () => {
    await close()
  })

  it('marks job as succeeded when sendEmail resolves', async () => {
    const service = createOutboxService<TestJobs>(db)
    await promise(
      service.enqueue({
        type: EMAIL_SEND_JOB_TYPE,
        payload: {
          message: {
            to: 'user@example.com',
            from: 'noreply@repro.dev',
            subject: 'Test',
            html: '<p>Test</p>',
          } as unknown as OutboxJson,
          emailKind: 'verification',
        },
      })
    )

    const worker = createOutboxWorker({
      outboxService: service,
      registry: {
        [EMAIL_SEND_JOB_TYPE]: () => resolve(undefined),
      },
      config: workerConfig(),
    })

    const result = await promise(worker.runOnce())
    const row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(result).toMatchObject({ claimed: 1, succeeded: 1 })
    expect(row.status).toEqual('succeeded')
  })

  it('retries when sendEmail rejects (pending + backoff)', async () => {
    const service = createOutboxService<TestJobs>(db)
    const runAfter = new Date(Date.now() - 1000)
    await promise(
      service.enqueue({
        type: EMAIL_SEND_JOB_TYPE,
        payload: {
          message: {
            to: 'user@example.com',
            from: 'noreply@repro.dev',
            subject: 'Test',
            html: '<p>Test</p>',
          } as unknown as OutboxJson,
          emailKind: 'verification',
        },
        maxAttempts: 3,
        runAfter,
      })
    )

    const worker = createOutboxWorker({
      outboxService: service,
      registry: {
        [EMAIL_SEND_JOB_TYPE]: () => reject(new Error('provider unavailable')),
      },
      config: workerConfig(),
    })

    const result = await promise(worker.runOnce())
    const row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(result.retried).toEqual(1)
    expect(row.status).toEqual('pending')
    expect(row.attempts).toEqual(1)
    expect(row.runAfter.getTime()).toBeGreaterThan(runAfter.getTime())
    expect(row.lastError?.message).toEqual('provider unavailable')
  })

  it('terminally fails after exhausting maxAttempts', async () => {
    const service = createOutboxService<TestJobs>(db)
    await promise(
      service.enqueue({
        type: EMAIL_SEND_JOB_TYPE,
        payload: {
          message: {
            to: 'user@example.com',
            from: 'noreply@repro.dev',
            subject: 'Test',
            html: '<p>Test</p>',
          } as unknown as OutboxJson,
          emailKind: 'verification',
        },
        maxAttempts: 1,
      })
    )

    const worker = createOutboxWorker({
      outboxService: service,
      registry: {
        [EMAIL_SEND_JOB_TYPE]: () => reject(new Error('terminal failure')),
      },
      config: workerConfig(),
    })

    const result = await promise(worker.runOnce())
    const row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(result.failed).toEqual(1)
    expect(row.status).toEqual('failed')
    expect(row.lastError).toMatchObject({ message: 'terminal failure' })
  })

  it('succeeds on retry after initial rejection', async () => {
    const service = createOutboxService<TestJobs>(db)
    const runAfter = new Date(Date.now() - 1000)
    await promise(
      service.enqueue({
        type: EMAIL_SEND_JOB_TYPE,
        payload: {
          message: {
            to: 'user@example.com',
            from: 'noreply@repro.dev',
            subject: 'Test',
            html: '<p>Test</p>',
          } as unknown as OutboxJson,
          emailKind: 'verification',
        },
        maxAttempts: 2,
        runAfter,
      })
    )

    let attempts = 0
    const worker = createOutboxWorker({
      outboxService: service,
      registry: {
        [EMAIL_SEND_JOB_TYPE]: () => {
          attempts++
          if (attempts === 1) {
            return reject(new Error('temporary failure'))
          }
          return resolve(undefined)
        },
      },
      config: {
        ...workerConfig(),
        baseDelayMs: 1,
        maxDelayMs: 10,
      },
    })

    // First run: retry
    await promise(worker.runOnce())
    let row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(row.status).toEqual('pending')

    // Wait for backoff to elapse
    await new Promise(resolve => setTimeout(resolve, 20))

    // Second run: succeed
    const result = await promise(worker.runOnce())
    row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(result.succeeded).toEqual(1)
    expect(row.status).toEqual('succeeded')
  })
})
