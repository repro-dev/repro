import { ApiClient } from '@repro/api-client'
import { Stats } from '@repro/diagnostics'
import { RecordingInfo } from '@repro/domain'
import { decryptF } from '@repro/encryption'
import { ReadableStream, TransformStream } from '@repro/stream-utils'
import { fromBinaryWireFormatStream } from '@repro/wire-formats'
import { chainRej, fork, map, resolve } from 'fluture'

const EMPTY_RESOURCE_MAP: Record<string, string> = {}

export function getRecordingInfo(apiClient: ApiClient, recordingId: string) {
  return apiClient.fetch<RecordingInfo>(`/recordings/${recordingId}/info`)
}

export function getRecordingEventsStream(
  apiClient: ApiClient,
  recordingId: string,
  encryptionKey?: string
) {
  return apiClient
    .fetch<ReadableStream<ArrayBuffer>>(
      `/recordings/${recordingId}/data`,
      undefined,
      'json',
      'stream'
    )
    .pipe(
      map(data =>
        Stats.time('createApiSource(): unpack binary wire format', () => {
          return fromBinaryWireFormatStream(data)
        })
      )
    )
    .pipe(
      map(stream =>
        stream.pipeThrough(
          new TransformStream<ArrayBuffer, ArrayBuffer>({
            transform(chunk, controller) {
              if (encryptionKey == null) {
                controller.enqueue(chunk)
                return
              }

              decryptF(chunk, encryptionKey).pipe(
                fork(error => {
                  controller.error(error)
                })(value => {
                  controller.enqueue(value)
                })
              )
            },

            flush(controller) {
              controller.terminate()
            },
          }),
          {
            preventClose: true,
          }
        )
      )
    )
}

export function getResourceMap(apiClient: ApiClient, recordingId: string) {
  return apiClient
    .fetch<Record<string, string>>(`/recordings/${recordingId}/resource-map`)
    .pipe(chainRej(() => resolve(EMPTY_RESOURCE_MAP)))
}
