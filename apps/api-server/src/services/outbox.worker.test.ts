import expect from 'expect'
import { promise, reject, resolve } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Database } from '~/modules/database'
import { setUpTestDatabase } from '~/testing/database'
import { createOutboxService } from './outbox'
import { createOutboxWorker } from './outboxWorker'

type TestJobs = {
  'test.work': { value: string }
}

describe('Services > Outbox worker', () => {
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

  it('claims due pending jobs and prevents another worker from claiming them', async () => {
    const service = createOutboxService<TestJobs>(db)
    await promise(
      service.enqueue({ type: 'test.work', payload: { value: 'a' } })
    )

    const [firstClaim, secondClaim] = await Promise.all([
      promise(
        service.claimPendingJobs({ workerId: 'worker-a', batchSize: 10 })
      ),
      promise(
        service.claimPendingJobs({ workerId: 'worker-b', batchSize: 10 })
      ),
    ])
    const totalClaimed = firstClaim.length + secondClaim.length
    const claimed = firstClaim[0] ?? secondClaim[0]

    expect(totalClaimed).toEqual(1)
    expect(claimed?.status).toEqual('running')
    expect(claimed?.attempts).toEqual(1)
  })

  it('reclaims stale running jobs after the worker crash threshold', async () => {
    const service = createOutboxService<TestJobs>(db)
    const originalLockTime = new Date(Date.now() - 10_000)
    await db
      .insertInto('outbox_jobs')
      .values({
        type: 'test.work',
        payload: { value: 'stale' },
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        lockedAt: originalLockTime,
        lockedBy: 'crashed-worker',
      })
      .execute()

    const claimed = await promise(
      service.claimPendingJobs({
        workerId: 'worker-reclaimer',
        batchSize: 10,
        staleAfterMs: 1000,
        now: new Date(),
      })
    )

    expect(claimed).toHaveLength(1)
    expect(claimed[0]?.status).toEqual('running')
    expect(claimed[0]?.attempts).toEqual(2)
    expect(claimed[0]?.lockedBy).toEqual('worker-reclaimer')
    expect(claimed[0]?.lockedAt?.getTime()).toBeGreaterThan(
      originalLockTime.getTime()
    )
  })

  it('terminally fails stale running jobs whose final attempt crashed', async () => {
    const service = createOutboxService<TestJobs>(db)
    await db
      .insertInto('outbox_jobs')
      .values({
        type: 'test.work',
        payload: { value: 'final-stale' },
        status: 'running',
        attempts: 1,
        maxAttempts: 1,
        lockedAt: new Date(Date.now() - 10_000),
        lockedBy: 'crashed-worker',
      })
      .execute()

    const claimed = await promise(
      service.claimPendingJobs({
        workerId: 'worker-reclaimer',
        batchSize: 10,
        staleAfterMs: 1000,
        now: new Date(),
      })
    )
    const row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(claimed).toHaveLength(0)
    expect(row.status).toEqual('failed')
    expect(row.lockedBy).toEqual(null)
    expect(row.lastError?.message).toContain('stale running job exhausted')
  })

  it('does not reclaim fresh running jobs', async () => {
    const service = createOutboxService<TestJobs>(db)
    await db
      .insertInto('outbox_jobs')
      .values({
        type: 'test.work',
        payload: { value: 'fresh' },
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        lockedAt: new Date(),
        lockedBy: 'active-worker',
      })
      .execute()

    const claimed = await promise(
      service.claimPendingJobs({
        workerId: 'worker-reclaimer',
        batchSize: 10,
        staleAfterMs: 60_000,
        now: new Date(),
      })
    )

    expect(claimed).toHaveLength(0)
  })

  it('marks successful handler execution as succeeded', async () => {
    const service = createOutboxService<TestJobs>(db)
    await promise(
      service.enqueue({ type: 'test.work', payload: { value: 'ok' } })
    )
    const worker = createOutboxWorker({
      outboxService: service,
      registry: { 'test.work': () => resolve(undefined) },
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

  it('does not let a stale worker success overwrite a reclaimed worker result', async () => {
    const service = createOutboxService<TestJobs>(db)
    const inserted = await db
      .insertInto('outbox_jobs')
      .values({
        type: 'test.work',
        payload: { value: 'fenced-success' },
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        lockedAt: new Date(Date.now() - 10_000),
        lockedBy: 'stale-worker',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const [reclaimed] = await promise(
      service.claimPendingJobs({
        workerId: 'new-worker',
        batchSize: 1,
        staleAfterMs: 1000,
        now: new Date(),
      })
    )

    await promise(
      service.markJobFailed(reclaimed!, new Error('new result'), workerConfig())
    )
    await promise(service.markJobSucceeded(inserted))
    const row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(row.status).toEqual('pending')
    expect(row.lockedBy).toEqual(null)
    expect(row.lastError?.message).toEqual('new result')
  })

  it('does not let a stale worker failure overwrite a reclaimed worker result', async () => {
    const service = createOutboxService<TestJobs>(db)
    const inserted = await db
      .insertInto('outbox_jobs')
      .values({
        type: 'test.work',
        payload: { value: 'fenced-failure' },
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        lockedAt: new Date(Date.now() - 10_000),
        lockedBy: 'stale-worker',
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const [reclaimed] = await promise(
      service.claimPendingJobs({
        workerId: 'new-worker',
        batchSize: 1,
        staleAfterMs: 1000,
        now: new Date(),
      })
    )

    await promise(service.markJobSucceeded(reclaimed!))
    await promise(
      service.markJobFailed(
        inserted,
        new Error('stale failure'),
        workerConfig()
      )
    )
    const row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(row.status).toEqual('succeeded')
    expect(row.lastError).toEqual(null)
  })

  it('retries failed jobs with exponential backoff', async () => {
    const service = createOutboxService<TestJobs>(db)
    const runAfter = new Date(Date.now() - 1000)
    await promise(
      service.enqueue({
        type: 'test.work',
        payload: { value: 'retry' },
        maxAttempts: 3,
        runAfter,
      })
    )
    const worker = createOutboxWorker({
      outboxService: service,
      registry: { 'test.work': () => reject(new Error('temporary failure')) },
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
    expect(row.lastError?.message).toEqual('temporary failure')
  })

  it('records terminal failure and lastError after attempts are exhausted', async () => {
    const service = createOutboxService<TestJobs>(db)
    await promise(
      service.enqueue({
        type: 'test.work',
        payload: { value: 'fail' },
        maxAttempts: 1,
      })
    )
    const worker = createOutboxWorker({
      outboxService: service,
      registry: { 'test.work': () => reject(new Error('terminal failure')) },
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

  it('fails jobs with no registered handler as terminal failures', async () => {
    const service = createOutboxService<TestJobs>(db)
    await promise(
      service.enqueue({
        type: 'test.work',
        payload: { value: 'missing' },
        maxAttempts: 1,
      })
    )
    const worker = createOutboxWorker({
      outboxService: service,
      registry: {},
      config: workerConfig(),
    })

    await promise(worker.runOnce())
    const row = await db
      .selectFrom('outbox_jobs')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(row.status).toEqual('failed')
    expect(row.lastError?.message).toContain('No outbox handler registered')
  })
})

function workerConfig() {
  return {
    workerId: 'worker-test',
    batchSize: 10,
    pollIntervalMs: 1000,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    staleAfterMs: 300000,
  }
}
