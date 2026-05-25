import { RecordingMode } from '@repro/domain'
import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Database, encodeId } from '~/modules/database'
import { setUpTestDatabase } from '~/testing/database'
import { createOutboxService } from './outbox'
import {
  RECORDING_FINALIZE_JOB_TYPE,
  createRecordingFinalizationService,
} from './recordingFinalization'

async function createRecording(
  db: Database
): Promise<{ id: number; encodedId: string }> {
  const row = await db
    .insertInto('recordings')
    .values({
      title: 'Recording',
      url: 'https://example.com',
      description: 'Test recording',
      mode: RecordingMode.Replay,
      duration: 1000,
      codecVersion: 'test',
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return { id: row.id, encodedId: encodeId(row.id) }
}

describe('Services > Recording finalization', () => {
  let db: Database
  let close: () => Promise<void>

  before(async () => {
    const harness = await setUpTestDatabase()
    db = harness.db
    close = harness.close
  })

  beforeEach(async () => {
    await db.deleteFrom('outbox_jobs').execute()
    await db.deleteFrom('recording_event_index').execute()
    await db.deleteFrom('recordings').execute()
  })

  after(async () => {
    await close()
  })

  it('does not enqueue finalize when only data has uploaded', async () => {
    const recording = await createRecording(db)
    const outboxService = createOutboxService(db)
    const service = createRecordingFinalizationService(db, outboxService)

    await promise(service.recordDataUploaded(recording.encodedId))

    const jobs = await db.selectFrom('outbox_jobs').selectAll().execute()
    expect(jobs).toHaveLength(0)
  })

  it('does not enqueue finalize when only event-index metadata has uploaded', async () => {
    const recording = await createRecording(db)
    const outboxService = createOutboxService(db)
    const service = createRecordingFinalizationService(db, outboxService)

    await db.transaction().execute(async trx => {
      await promise(
        service.recordEventIndexUploadedWithTransaction(trx, recording.id)
      )
    })

    const jobs = await db.selectFrom('outbox_jobs').selectAll().execute()
    expect(jobs).toHaveLength(0)
  })

  it('marks a recording ready and enqueues one durable finalize job', async () => {
    const recording = await createRecording(db)
    const outboxService = createOutboxService(db)
    const service = createRecordingFinalizationService(db, outboxService)

    await promise(service.recordDataUploaded(recording.encodedId))
    await db.transaction().execute(async trx => {
      await promise(
        service.recordEventIndexUploadedWithTransaction(trx, recording.id)
      )
    })

    const row = await db
      .selectFrom('recordings')
      .select(['derivedProcessingReadyAt'])
      .where('id', '=', recording.id)
      .executeTakeFirstOrThrow()
    const jobs = await db.selectFrom('outbox_jobs').selectAll().execute()

    expect(row.derivedProcessingReadyAt).toBeInstanceOf(Date)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.type).toEqual(RECORDING_FINALIZE_JOB_TYPE)
    expect(jobs[0]?.idempotencyKey).toEqual(
      `recording.finalize:${recording.encodedId}`
    )
  })

  it('deduplicates repeated readiness and finalization attempts', async () => {
    const recording = await createRecording(db)
    const outboxService = createOutboxService(db)
    const service = createRecordingFinalizationService(db, outboxService)

    await promise(service.recordDataUploaded(recording.encodedId))
    await promise(service.recordDataUploaded(recording.encodedId))
    await db.transaction().execute(async trx => {
      await promise(
        service.recordEventIndexUploadedWithTransaction(trx, recording.id)
      )
      await promise(
        service.recordEventIndexUploadedWithTransaction(trx, recording.id)
      )
    })
    await promise(service.finalizeRecording(recording.encodedId))
    await promise(service.finalizeRecording(recording.encodedId))

    const jobs = await db.selectFrom('outbox_jobs').selectAll().execute()
    const recordingRow = await db
      .selectFrom('recordings')
      .select(['finalizedAt'])
      .where('id', '=', recording.id)
      .executeTakeFirstOrThrow()

    expect(
      jobs.filter(job => job.type === RECORDING_FINALIZE_JOB_TYPE)
    ).toHaveLength(1)
    expect(recordingRow.finalizedAt).toBeInstanceOf(Date)
  })

  it('enqueues configured downstream jobs when finalizing', async () => {
    const recording = await createRecording(db)
    const outboxService = createOutboxService(db)
    const service = createRecordingFinalizationService(db, outboxService, {
      downstreamJobs: [
        {
          type: 'test.downstream',
          payload: recordingId => ({ recordingId }),
          idempotencyKey: recordingId => `test.downstream:${recordingId}`,
        },
      ],
    })

    await promise(service.recordDataUploaded(recording.encodedId))
    await db.transaction().execute(async trx => {
      await promise(
        service.recordEventIndexUploadedWithTransaction(trx, recording.id)
      )
    })
    await promise(service.finalizeRecording(recording.encodedId))

    const jobs = await db
      .selectFrom('outbox_jobs')
      .select(['type', 'payload', 'idempotencyKey'])
      .orderBy('type')
      .execute()

    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'test.downstream',
          payload: { recordingId: recording.encodedId },
          idempotencyKey: `test.downstream:${recording.encodedId}`,
        }),
      ])
    )
  })
})
