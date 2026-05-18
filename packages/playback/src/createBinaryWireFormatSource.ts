import { createAtom } from '@repro/atom'
import { SourceEventView } from '@repro/domain'
import { calculateDuration } from '@repro/source-utils'
import { List } from '@repro/tdl'
import { fromBinaryWireFormatStream } from '@repro/wire-formats'
import { ReadyState, Source } from './types'

type BinaryWireFormatStream = Parameters<typeof fromBinaryWireFormatStream>[0]

function toArrayBufferStream(stream: ReadableStream<Uint8Array>) {
  return stream.pipeThrough(
    new TransformStream<Uint8Array, ArrayBuffer>({
      transform(chunk, controller) {
        controller.enqueue(
          chunk.buffer.slice(
            chunk.byteOffset,
            chunk.byteOffset + chunk.byteLength
          )
        )
      },
    })
  ) as BinaryWireFormatStream
}

export function createBinaryWireFormatSource(
  stream: ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>
): Source {
  const [$events, setEvents] = createAtom(new List(SourceEventView, []))
  const [$duration, setDuration] = createAtom(0)
  const [$readyState, setReadyState] = createAtom<ReadyState>('waiting')
  const [$error, setError] = createAtom<Error | null>(null)
  const [$resourceMap] = createAtom<Record<string, string>>({})

  Promise.resolve(stream)
    .then(stream =>
      fromBinaryWireFormatStream(toArrayBufferStream(stream)).pipeTo(
        new WritableStream({
          write(buffer) {
            const events = $events.getValue().slice()

            events.append(SourceEventView.over(new DataView(buffer)))

            setEvents(events)
            setDuration(calculateDuration(events))
          },
        })
      )
    )
    .then(() => {
      setReadyState('ready')
    })
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
