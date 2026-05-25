import { FutureInstance, attemptP, promise, reject } from 'fluture'
import { Transaction, sql } from 'kysely'
import { Database, OutboxJson, decodeId, encodeId } from '~/modules/database'
import { Schema } from '~/modules/database/schema'
import { badRequest } from '~/utils/errors'
import { OutboxService } from './outbox'

export const RECORDING_FINALIZE_JOB_TYPE = 'recording.finalize'
export const RECORDING_INDEX_ERRORS_JOB_TYPE = 'recording.index_errors'

export type RecordingFinalizePayload = { recordingId: string }
export type RecordingIndexErrorsPayload = { recordingId: string }

export interface RecordingDerivedJobDescriptor {
  type: string
  payload(recordingId: string): OutboxJson
  idempotencyKey(recordingId: string): string
}

export const recordingIndexErrorsDerivedJob: RecordingDerivedJobDescriptor = {
  type: RECORDING_INDEX_ERRORS_JOB_TYPE,
  payload: recordingId => ({ recordingId }),
  idempotencyKey: recordingId =>
    `${RECORDING_INDEX_ERRORS_JOB_TYPE}:${recordingId}`,
}

export interface RecordingFinalizationOptions {
  downstreamJobs?: ReadonlyArray<RecordingDerivedJobDescriptor>
}

function decodeRecordingId(recordingId: string): number | null {
  return decodeId(recordingId)
}

export function createRecordingFinalizationService(
  database: Database,
  outboxService: OutboxService,
  options: RecordingFinalizationOptions = {}
) {
  const downstreamJobs = options.downstreamJobs ?? []

  function enqueueFinalizeIfReadyWithTransaction(
    trx: Transaction<Schema>,
    decodedRecordingId: number,
    encodedRecordingId: string
  ): FutureInstance<Error, void> {
    return attemptP(async () => {
      const ready = await trx
        .updateTable('recordings')
        .set(({ fn }) => ({
          derivedProcessingReadyAt: fn.coalesce(
            'derivedProcessingReadyAt',
            sql<Date>`CURRENT_TIMESTAMP`
          ),
        }))
        .where('id', '=', decodedRecordingId)
        .where('dataUploadedAt', 'is not', null)
        .where('eventIndexUploadedAt', 'is not', null)
        .returning('derivedProcessingReadyAt')
        .executeTakeFirst()

      if (!ready) {
        return
      }

      await promise(
        outboxService.enqueueWithTransaction(trx, {
          type: RECORDING_FINALIZE_JOB_TYPE,
          payload: { recordingId: encodedRecordingId },
          idempotencyKey: `${RECORDING_FINALIZE_JOB_TYPE}:${encodedRecordingId}`,
        })
      )
    })
  }

  function recordDataUploaded(
    recordingId: string
  ): FutureInstance<Error, void> {
    const decodedRecordingId = decodeRecordingId(recordingId)

    if (decodedRecordingId == null) {
      return reject(badRequest(`Invalid recording ID "${recordingId}"`))
    }

    return attemptP(() =>
      database.transaction().execute(async trx => {
        await trx
          .updateTable('recordings')
          .set(({ fn }) => ({
            dataUploadedAt: fn.coalesce(
              'dataUploadedAt',
              sql<Date>`CURRENT_TIMESTAMP`
            ),
          }))
          .where('id', '=', decodedRecordingId)
          .execute()

        await promise(
          enqueueFinalizeIfReadyWithTransaction(
            trx,
            decodedRecordingId,
            recordingId
          )
        )
      })
    )
  }

  function recordEventIndexUploadedWithTransaction(
    trx: Transaction<Schema>,
    recordingId: number
  ): FutureInstance<Error, void> {
    return attemptP(async () => {
      await trx
        .updateTable('recordings')
        .set(({ fn }) => ({
          eventIndexUploadedAt: fn.coalesce(
            'eventIndexUploadedAt',
            sql<Date>`CURRENT_TIMESTAMP`
          ),
        }))
        .where('id', '=', recordingId)
        .execute()

      await promise(
        enqueueFinalizeIfReadyWithTransaction(
          trx,
          recordingId,
          encodeId(recordingId)
        )
      )
    })
  }

  function finalizeRecording(recordingId: string): FutureInstance<Error, void> {
    const decodedRecordingId = decodeRecordingId(recordingId)

    if (decodedRecordingId == null) {
      return reject(badRequest(`Invalid recording ID "${recordingId}"`))
    }

    return attemptP(() =>
      database.transaction().execute(async trx => {
        const row = await trx
          .selectFrom('recordings')
          .select([
            'dataUploadedAt',
            'eventIndexUploadedAt',
            'derivedProcessingReadyAt',
            'finalizedAt',
          ])
          .where('id', '=', decodedRecordingId)
          .forUpdate()
          .executeTakeFirst()

        if (
          !row ||
          row.finalizedAt ||
          !row.dataUploadedAt ||
          !row.eventIndexUploadedAt ||
          !row.derivedProcessingReadyAt
        ) {
          return
        }

        for (const descriptor of downstreamJobs) {
          await promise(
            outboxService.enqueueWithTransaction(trx, {
              type: descriptor.type,
              payload: descriptor.payload(recordingId),
              idempotencyKey: descriptor.idempotencyKey(recordingId),
            })
          )
        }

        await trx
          .updateTable('recordings')
          .set(({ fn }) => ({
            finalizedAt: fn.coalesce(
              'finalizedAt',
              sql<Date>`CURRENT_TIMESTAMP`
            ),
          }))
          .where('id', '=', decodedRecordingId)
          .execute()
      })
    )
  }

  return {
    recordDataUploaded,
    recordEventIndexUploadedWithTransaction,
    enqueueFinalizeIfReadyWithTransaction,
    finalizeRecording,
  }
}

export type RecordingFinalizationService = ReturnType<
  typeof createRecordingFinalizationService
>
