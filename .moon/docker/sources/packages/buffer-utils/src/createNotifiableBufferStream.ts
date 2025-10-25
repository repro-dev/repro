import { ReadableStream } from '@repro/stream-utils'

interface Options {
  chunkSize: number
}

const defaultOptions: Options = {
  chunkSize: 2 ** 8,
}

export function createNotifiableBufferStream(
  bufferSource: ArrayBufferLike,
  notify: (bytesRead: number, byteLength: number) => void,
  options: Options = defaultOptions
): ReadableStream<ArrayBufferLike> {
  let bytesRead = 0
  const byteLength = bufferSource.byteLength

  return new ReadableStream({
    pull(controller) {
      if (bytesRead === byteLength) {
        controller.close()
        return
      }

      const chunk = new Uint8Array(
        bufferSource.slice(bytesRead, bytesRead + options.chunkSize)
      )

      controller.enqueue(chunk)

      bytesRead = Math.min(bytesRead + chunk.byteLength, byteLength)
      notify(bytesRead, byteLength)
    },
  })
}
