import { OutboxJson } from '~/modules/database'
import { createOutboxRegistry } from '~/services/outbox'
import {
  RECORDING_FINALIZE_JOB_TYPE,
  RecordingFinalizationService,
} from '~/services/recordingFinalization'

export interface CreateDefaultOutboxRegistryParams {
  recordingFinalizationService: RecordingFinalizationService
}

export function createDefaultOutboxRegistry({
  recordingFinalizationService,
}: CreateDefaultOutboxRegistryParams) {
  return createOutboxRegistry({
    [RECORDING_FINALIZE_JOB_TYPE]: (payload: OutboxJson) => {
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
  })
}

export type DefaultOutboxRegistry = ReturnType<
  typeof createDefaultOutboxRegistry
>
