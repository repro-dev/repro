import { ApiClient } from '@repro/api-client'
import { Stats } from '@repro/diagnostics'
import { RecordingInfo } from '@repro/domain'
import { decryptF } from '@repro/encryption'
import { ReadableStream, TransformStream } from '@repro/stream-utils'
import { fromBinaryWireFormatStream } from '@repro/wire-formats'
import { chainRej, fork, map, resolve } from 'fluture'

const EMPTY_RESOURCE_MAP: Record<string, string> = {}

type BinaryWireFormatStream = Parameters<typeof fromBinaryWireFormatStream>[0]

function toArrayBuffer(chunk: Uint8Array): ArrayBuffer {
  if (chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength) {
    return chunk.buffer
  }

  return chunk.buffer.slice(
    chunk.byteOffset,
    chunk.byteOffset + chunk.byteLength
  )
}

function toArrayBufferStream(stream: ReadableStream<Uint8Array>) {
  return stream.pipeThrough(
    new TransformStream<Uint8Array, ArrayBuffer>({
      transform(chunk, controller) {
        controller.enqueue(toArrayBuffer(chunk))
      },
    })
  ) as BinaryWireFormatStream
}

export function getRecordingInfo(
  apiClient: ApiClient,
  projectId: string,
  recordingId: string
) {
  return apiClient.fetch<RecordingInfo>(
    `/projects/${projectId}/recordings/${recordingId}/info`
  )
}

export function getRecordingEventsStream(
  apiClient: ApiClient,
  projectId: string,
  recordingId: string,
  encryptionKey?: string
) {
  return apiClient
    .fetch<ReadableStream<Uint8Array>>(
      `/projects/${projectId}/recordings/${recordingId}/data`,
      undefined,
      'json',
      'stream'
    )
    .pipe(
      map(data =>
        Stats.time('createApiSource(): unpack binary wire format', () => {
          return fromBinaryWireFormatStream(toArrayBufferStream(data))
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

export function getResourceMap(
  apiClient: ApiClient,
  projectId: string,
  recordingId: string
) {
  return apiClient
    .fetch<Record<string, string>>(
      `/projects/${projectId}/recordings/${recordingId}/resource-map`
    )
    .pipe(chainRej(() => resolve(EMPTY_RESOURCE_MAP)))
}
