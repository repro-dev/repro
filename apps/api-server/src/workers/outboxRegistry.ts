import { EmailMessage } from '@repro/email'
import { OutboxJobRow, OutboxJson } from '~/modules/database'
import { SendEmail } from '~/modules/email'
import { createOutboxRegistry } from '~/services/outbox'
import { RecordingErrorIndexingService } from '~/services/recordingErrorIndexing'
import {
  RECORDING_FINALIZE_JOB_TYPE,
  RECORDING_INDEX_ERRORS_JOB_TYPE,
  RecordingFinalizationService,
} from '~/services/recordingFinalization'

export const EMAIL_SEND_JOB_TYPE = 'email.send'

export interface CreateDefaultOutboxRegistryParams {
  recordingFinalizationService: RecordingFinalizationService
  recordingErrorIndexingService: RecordingErrorIndexingService
  sendEmail?: SendEmail
}

export function createDefaultOutboxRegistry({
  recordingFinalizationService,
  recordingErrorIndexingService,
  sendEmail,
}: CreateDefaultOutboxRegistryParams) {
  return createOutboxRegistry({
    [EMAIL_SEND_JOB_TYPE]: (payload: OutboxJson, _job: OutboxJobRow) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        !payload.message ||
        typeof payload.message !== 'object' ||
        Array.isArray(payload.message)
      ) {
        throw new Error('Invalid email.send outbox payload')
      }

      const p = payload as unknown as {
        message: EmailMessage
        emailKind: string
      }

      if (typeof p.message.to !== 'string') {
        throw new Error(
          'Invalid email.send outbox payload: message.to must be a string'
        )
      }

      if (!sendEmail) {
        throw new Error('No email provider configured for email.send handler')
      }

      return sendEmail(p.message)
    },
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
