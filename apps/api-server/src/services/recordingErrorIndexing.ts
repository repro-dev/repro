import {
  LogLevel,
  SourceEventType,
  SourceEventView,
  StackEntry,
} from '@repro/domain'
import { BufferListView } from '@repro/wire-formats/generated/buffer-list'
import { FutureInstance, attemptP, promise } from 'fluture'
import { createHash } from 'node:crypto'
import {
  Database,
  OutboxJobRow,
  OutboxJson,
  decodeId,
} from '~/modules/database'
import { Storage } from '~/modules/storage'
import { badRequest, serverError } from '~/utils/errors'

function normalizeFrame(frame: StackEntry): {
  fileName: string
  functionName: string
} {
  const fileName = frame.fileName.split('?')[0] ?? frame.fileName
  const functionName = frame.functionName ?? ''
  return { fileName, functionName }
}

/**
 * Compute a SHA-256 fingerprint from an array of stack frames.
 * Only fileName:functionName pairs are included (not line/column)
 * for build-stable fingerprints.
 */
export function computeFingerprint(stack: Array<StackEntry>): string {
  const normalized = stack
    .map(frame => {
      const { fileName, functionName } = normalizeFrame(frame)
      return `${fileName}:${functionName}`
    })
    .join('\n')
  return createHash('sha256').update(normalized).digest('hex')
}

function extractMessage(data: { parts: Array<any> }): string {
  const parts = data.parts ?? []
  return parts
    .map((part: any) => {
      // Parts are decoded as Box instances by the union decoder
      // Unwrap to access the inner value
      const unwrapped =
        part && typeof part.unwrap === 'function' ? part.unwrap() : part
      return unwrapped && typeof unwrapped === 'object' && 'value' in unwrapped
        ? String(unwrapped.value)
        : ''
    })
    .join(' ')
}

export function createRecordingErrorIndexingService(
  database: Database,
  storage: Storage
) {
  function handler(
    payload: OutboxJson,
    _job: OutboxJobRow
  ): FutureInstance<Error, void> {
    return attemptP(async () => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        typeof payload.recordingId !== 'string'
      ) {
        throw badRequest('Invalid recording.index_errors payload')
      }

      const encodedRecordingId = payload.recordingId

      const decodedRecordingId = decodeId(encodedRecordingId)
      if (decodedRecordingId == null) {
        throw badRequest(
          `Invalid recording ID in error indexing payload: "${encodedRecordingId}"`
        )
      }

      // Read recording data from storage
      const dataStream = await promise(
        storage.read(`${encodedRecordingId}/data`)
      )

      // Collect stream into a Buffer and make a clean copy to avoid TDL
      // decodeBuffer issue with pooled Node.js Buffer backing (view.buffer.slice
      // doesn't account for view.byteOffset)
      const chunks: Array<Buffer> = []
      for await (const chunk of dataStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const rawBuffer = Buffer.concat(chunks)
      const cleanBytes = new Uint8Array(rawBuffer)
      const cleanView = new DataView(
        cleanBytes.buffer,
        cleanBytes.byteOffset,
        cleanBytes.byteLength
      )

      // Decode binary wire format
      let buffers: Array<ArrayBuffer>
      try {
        buffers = BufferListView.decode(cleanView)
      } catch (err) {
        throw serverError(
          `Failed to decode recording wire format: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }

      // Decode each event and extract console errors
      const errors: Array<{
        message: string
        fingerprint: string
        stackHash: string
        occurredAt: Date
      }> = []

      for (const arrayBuffer of buffers) {
        let sourceEventBox: any
        try {
          sourceEventBox = SourceEventView.decode(new DataView(arrayBuffer))
        } catch {
          // Skip un-decodable events
          continue
        }

        if (
          !sourceEventBox ||
          typeof sourceEventBox !== 'object' ||
          !('unwrap' in sourceEventBox)
        ) {
          continue
        }

        const sourceEvent = sourceEventBox.unwrap()

        // Check if this is a Console event with LogLevel.Error
        if (
          sourceEvent &&
          typeof sourceEvent === 'object' &&
          'type' in sourceEvent &&
          sourceEvent.type === SourceEventType.Console &&
          'data' in sourceEvent &&
          sourceEvent.data &&
          typeof sourceEvent.data === 'object' &&
          'level' in sourceEvent.data &&
          sourceEvent.data.level === LogLevel.Error &&
          'stack' in sourceEvent.data &&
          Array.isArray(sourceEvent.data.stack)
        ) {
          const message = extractMessage(sourceEvent.data)
          const stack: Array<StackEntry> = sourceEvent.data.stack
          const fingerprint = computeFingerprint(stack)
          const stackHash = createHash('sha256')
            .update(
              stack
                .map(
                  s =>
                    `${s.fileName}:${s.functionName ?? ''}:${s.lineNumber}:${
                      s.columnNumber
                    }`
                )
                .join('\n')
            )
            .digest('hex')
          const occurredAt = new Date(sourceEvent.time) // time is in ms

          errors.push({
            message,
            fingerprint,
            stackHash,
            occurredAt,
          })
        }
      }

      // Idempotent replacement: delete existing rows, then insert
      await database
        .deleteFrom('recording_errors')
        .where('recordingId', '=', decodedRecordingId)
        .execute()

      if (errors.length > 0) {
        await database
          .insertInto('recording_errors')
          .values(
            errors.map(e => ({
              recordingId: decodedRecordingId,
              fingerprint: e.fingerprint,
              message: e.message,
              stackHash: e.stackHash,
              occurredAt: e.occurredAt,
            }))
          )
          .execute()
      }
    })
  }

  return {
    handler,
  }
}

export type RecordingErrorIndexingService = ReturnType<
  typeof createRecordingErrorIndexingService
>
