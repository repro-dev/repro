import { OutboxJobRow, OutboxJson } from '~/modules/database'
import { createOutboxRegistry } from '~/services/outbox'
import { RecordingErrorIndexingService } from '~/services/recordingErrorIndexing'
import {
  RECORDING_FINALIZE_JOB_TYPE,
  RECORDING_INDEX_ERRORS_JOB_TYPE,
  RecordingFinalizationService,
} from '~/services/recordingFinalization'

export interface CreateDefaultOutboxRegistryParams {
  recordingFinalizationService: RecordingFinalizationService
  recordingErrorIndexingService: RecordingErrorIndexingService
}

export function createDefaultOutboxRegistry({
  recordingFinalizationService,
  recordingErrorIndexingService,
}: CreateDefaultOutboxRegistryParams) {
  return createOutboxRegistry({
    [RECORDING_FINALIZE_JOB_TYPE]: (
      payload: OutboxJson,
      _job: OutboxJobRow
    ) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        typeof payload.recordingId !== 'string'
      ) {
        throw new Error('Invalid recording.finalize outbox payload')
      }

      return recordingFinalizationService.finalizeRecording(payload.recordingId)
    },
    [RECORDING_INDEX_ERRORS_JOB_TYPE]: (
      payload: OutboxJson,
      job: OutboxJobRow
    ) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        typeof payload.recordingId !== 'string'
      ) {
        throw new Error('Invalid recording.index_errors outbox payload')
      }

      return recordingErrorIndexingService.handler(payload, job)
    },
  })
}

export type DefaultOutboxRegistry = ReturnType<
  typeof createDefaultOutboxRegistry
>
