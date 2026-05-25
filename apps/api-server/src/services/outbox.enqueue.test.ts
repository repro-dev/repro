import expect from 'expect'
import { promise } from 'fluture'
import { sql } from 'kysely'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Database } from '~/modules/database'
import { setUpTestDatabase } from '~/testing/database'
import { createOutboxService } from './outbox'

type TestJobs = {
  'test.email': { to: string }
}

describe('Services > Outbox enqueue', () => {
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

  it('creates the outbox table with polling and inspection indexes', async () => {
    const columns = await sql<{ column_name: string }>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'outbox_jobs'
    `.execute(db)
    const indexes = await sql<{ indexname: string }>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'outbox_jobs'
    `.execute(db)

    expect(columns.rows.map(row => row.column_name)).toEqual(
      expect.arrayContaining([
        'type',
        'payload',
        'status',
        'attempts',
        'maxAttempts',
        'runAfter',
        'lockedAt',
        'lockedBy',
        'lastError',
        'idempotencyKey',
      ])
    )
    expect(indexes.rows.map(row => row.indexname)).toEqual(
      expect.arrayContaining([
        'outbox_jobs_idempotency_key_unique_idx',
        'outbox_jobs_pending_poll_idx',
        'outbox_jobs_failed_inspection_idx',
        'outbox_jobs_stale_running_idx',
      ])
    )
  })

  it('deduplicates jobs with the same idempotency key', async () => {
    const service = createOutboxService<TestJobs>(db)

    const first = await promise(
      service.enqueue({
        type: 'test.email',
        payload: { to: 'a@example.com' },
        idempotencyKey: 'email:a',
      })
    )
    const second = await promise(
      service.enqueue({
        type: 'test.email',
        payload: { to: 'b@example.com' },
        idempotencyKey: 'email:a',
      })
    )
    const rows = await db.selectFrom('outbox_jobs').selectAll().execute()

    expect(first.deduplicated).toEqual(false)
    expect(second.deduplicated).toEqual(true)
    expect(second.job.id).toEqual(first.job.id)
    expect(rows).toHaveLength(1)
  })

  it('creates separate jobs when no idempotency key is provided', async () => {
    const service = createOutboxService<TestJobs>(db)

    await promise(service.enqueue({ type: 'test.email', payload: { to: 'a' } }))
    await promise(service.enqueue({ type: 'test.email', payload: { to: 'a' } }))

    const count = await db
      .selectFrom('outbox_jobs')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()

    expect(Number(count.count)).toEqual(2)
  })

  it('uses the configured default max attempts when enqueue omits an override', async () => {
    const service = createOutboxService<TestJobs>(db, { defaultMaxAttempts: 5 })

    const result = await promise(
      service.enqueue({ type: 'test.email', payload: { to: 'a' } })
    )

    expect(result.job.maxAttempts).toEqual(5)
  })

  it('caps health diagnostics while still surfacing failed and stale jobs', async () => {
    const service = createOutboxService<TestJobs>(db)
    await db
      .insertInto('outbox_jobs')
      .values([
        {
          type: 'test.email',
          payload: { to: 'failed' },
          status: 'failed',
          lastError: { message: 'failed' },
        },
        {
          type: 'test.email',
          payload: { to: 'stale' },
          status: 'running',
          attempts: 1,
          lockedAt: new Date(Date.now() - 10_000),
          lockedBy: 'worker-a',
        },
        {
          type: 'test.email',
          payload: { to: 'pending-a' },
        },
        {
          type: 'test.email',
          payload: { to: 'pending-b' },
        },
      ])
      .execute()

    const diagnostics = await promise(
      service.getDiagnostics({ staleAfterMs: 1000, countLimit: 1 })
    )

    expect(diagnostics).toEqual({
      pending: 1,
      running: 1,
      failed: 1,
      staleRunning: 1,
    })
  })

  it('rolls back enqueueWithTransaction with the outer transaction', async () => {
    const service = createOutboxService<TestJobs>(db)

    await db
      .transaction()
      .execute(async trx => {
        await promise(
          service.enqueueWithTransaction(trx, {
            type: 'test.email',
            payload: { to: 'rollback@example.com' },
          })
        )
        throw new Error('rollback')
      })
      .catch(() => undefined)

    const rows = await db.selectFrom('outbox_jobs').selectAll().execute()
    expect(rows).toHaveLength(0)
  })
})
