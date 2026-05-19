import { createAtom } from '@repro/atom'
import { SourceEventView } from '@repro/domain'
import { List } from '@repro/tdl'
import { fromBinaryWireFormatStream } from '@repro/wire-formats'
import { ReadyState, Source } from './types'

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

export function createBinaryWireFormatSource(
  stream: ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>
): Source {
  const [$events, , getEvents] = createAtom(new List(SourceEventView, []))
  const [$duration, setDuration] = createAtom(0)
  const [$readyState, setReadyState] = createAtom<ReadyState>('waiting')
  const [$error, setError] = createAtom<Error | null>(null)
  const [$resourceMap] = createAtom<Record<string, string>>({})

  let firstEventTime: number | null = null

  Promise.resolve(stream)
    .then(stream =>
      fromBinaryWireFormatStream(toArrayBufferStream(stream)).pipeTo(
        new WritableStream({
          write(buffer) {
            const event = SourceEventView.over(new DataView(buffer))
            const events = getEvents()

            events.append(event)

            const time = event.get('time').orElse(0)

            if (firstEventTime == null) {
              firstEventTime = time
            }

            setDuration(time - (firstEventTime ?? time))
          },

          close() {
            setReadyState('ready')
          },
        })
      )
    )
    .catch(error => {
      setError(error instanceof Error ? error : new Error(String(error)))
      setReadyState('failed')
    })

  return {
    $events,
    $duration,
    $readyState,
    $error,
    $resourceMap,
  }
}
