import expect from 'expect'
import { reject } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Database } from '~/modules/database'
import { ApiLogger } from '~/modules/logger'
import { setUpTestDatabase } from '~/testing/database'
import { EMAIL_SEND_JOB_TYPE } from '~/workers/outboxRegistry'
import { createOutboxService, type OutboxService } from './outbox'
import { createTransactionalEmailService } from './transactionalEmail'

function createLoggerSpy() {
  const calls: Array<{ payload: unknown; message?: string }> = []
  const logger: ApiLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (payload, message) => {
      calls.push({ payload, message })
    },
    fatal: () => {},
    child: () => logger,
  }
  return { logger, calls }
}

async function waitForJobs(db: Database, expectedCount: number): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const rows = await db.selectFrom('outbox_jobs').selectAll().execute()
    if (rows.length >= expectedCount) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('Services > Transactional Email', () => {
  let db: Database
  let close: () => Promise<void>
  let outboxService: OutboxService

  before(async () => {
    const harness = await setUpTestDatabase()
    db = harness.db
    close = harness.close
    outboxService = createOutboxService(db)
  })

  beforeEach(async () => {
    await db.deleteFrom('outbox_jobs').execute()
  })

  after(async () => {
    await close()
  })

  describe('enqueue', () => {
    it('enqueues two distinct rows when called without idempotencyKey (no dedup)', async () => {
      const { logger } = createLoggerSpy()
      const service = createTransactionalEmailService({ outboxService, logger })

      const message = {
        to: 'user@example.com',
        from: 'noreply@repro.dev',
        subject: 'Test',
        html: '<p>Test</p>',
      }

      // Enqueue twice without idempotencyKey
      service.enqueue(message, { emailKind: 'verification' })
      await waitForJobs(db, 1)

      service.enqueue(message, { emailKind: 'verification' })
      await waitForJobs(db, 2)

      const rows = await db.selectFrom('outbox_jobs').selectAll().execute()

      expect(rows).toHaveLength(2)
      expect(rows[0]?.idempotencyKey).toBeNull()
      expect(rows[1]?.idempotencyKey).toBeNull()
    })

    it('enqueues an email.send job with correct type, payload, and idempotencyKey', async () => {
      const { logger } = createLoggerSpy()
      const service = createTransactionalEmailService({ outboxService, logger })

      const message = {
        to: 'user@example.com',
        from: 'noreply@repro.dev',
        subject: 'Test',
        html: '<p>Test</p>',
      }

      service.enqueue(message, {
        emailKind: 'verification',
        idempotencyKey: 'email.send:verification:token-123',
      })

      await waitForJobs(db, 1)

      const rows = await db.selectFrom('outbox_jobs').selectAll().execute()

      expect(rows).toHaveLength(1)
      expect(rows[0]?.type).toEqual(EMAIL_SEND_JOB_TYPE)
      expect(rows[0]?.payload).toMatchObject({
        message: {
          to: 'user@example.com',
          from: 'noreply@repro.dev',
          subject: 'Test',
          html: '<p>Test</p>',
        },
        emailKind: 'verification',
      })
      expect(rows[0]?.idempotencyKey).toEqual(
        'email.send:verification:token-123'
      )
    })

    it('deduplicates jobs with the same idempotencyKey (exactly one row)', async () => {
      const { logger } = createLoggerSpy()
      const service = createTransactionalEmailService({ outboxService, logger })

      const message = {
        to: 'user@example.com',
        from: 'noreply@repro.dev',
        subject: 'Test',
        html: '<p>Test</p>',
      }
      const idempotencyKey = 'email.send:verification:token-456'

      service.enqueue(message, { emailKind: 'verification', idempotencyKey })
      await waitForJobs(db, 1)

      service.enqueue(message, { emailKind: 'verification', idempotencyKey })
      await waitForJobs(db, 1)

      const rows = await db.selectFrom('outbox_jobs').selectAll().execute()

      expect(rows).toHaveLength(1)
    })

    it('creates distinct rows for different idempotencyKeys', async () => {
      const { logger } = createLoggerSpy()
      const service = createTransactionalEmailService({ outboxService, logger })

      const message = {
        to: 'user@example.com',
        from: 'noreply@repro.dev',
        subject: 'Test',
        html: '<p>Test</p>',
      }

      service.enqueue(message, {
        emailKind: 'verification',
        idempotencyKey: 'email.send:verification:token-a',
      })
      await waitForJobs(db, 1)

      service.enqueue(message, {
        emailKind: 'password_reset',
        idempotencyKey: 'email.send:password_reset:token-b',
      })
      await waitForJobs(db, 2)

      const rows = await db.selectFrom('outbox_jobs').selectAll().execute()

      expect(rows).toHaveLength(2)
    })

    it('logs and swallows enqueue failures (non-blocking)', async () => {
      const { logger, calls } = createLoggerSpy()

      const failingOutboxService = {
        enqueue: () => reject(new Error('database connection lost')),
        enqueueWithTransaction: () =>
          reject(new Error('database connection lost')),
      } as unknown as OutboxService

      const service = createTransactionalEmailService({
        outboxService: failingOutboxService,
        logger,
      })

      const message = {
        to: 'user@example.com',
        from: 'noreply@repro.dev',
        subject: 'Test',
        html: '<p>Test</p>',
      }

      service.enqueue(message, {
        emailKind: 'verification',
        idempotencyKey: 'email.send:verification:token-789',
        context: { requestId: 'req-123' },
      })

      // Wait for the fork to reject
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(calls).toHaveLength(1)
      expect(calls[0]?.payload).toMatchObject({
        event: 'transactional_email.enqueue_failed',
        emailKind: 'verification',
        requestId: 'req-123',
      })
    })
  })
})
