import { ReadableStream } from '@repro/stream-utils'
import { BufferListView } from './generated/buffer-list'

export function toBinaryWireFormat(items: Array<DataView>) {
  return BufferListView.encode(
    items.map(item => item.buffer.slice(item.byteOffset, item.byteLength))
  )
}

export function fromBinaryWireFormat(buffer: DataView) {
  return BufferListView.decode(buffer)
}

const LIST_SIZE_BYTE_LENGTH = 4
const FIELD_OFFSET_BYTE_LENGTH = 4
const BUFFER_SIZE_BYTE_LENGTH = 4
const BUFFER_CHUNK_SIZE = 1024 * 1024
const LITTLE_ENDIAN = true

function writeToBuffer(
  target: ArrayBuffer,
  source: ArrayBuffer,
  byteOffset: number
): ArrayBuffer {
  // NOTE: If source will overflow target buffer, grow target by increments of `BUFFER_CHUNK_SIZE`
  while (byteOffset + source.byteLength > target.byteLength) {
    target = writeToBuffer(
      new ArrayBuffer(target.byteLength + BUFFER_CHUNK_SIZE),
      target,
      0
    )
  }

  new Uint8Array(target).set(new Uint8Array(source), byteOffset)

  return target
}

export function fromBinaryWireFormatStream(
  stream: ReadableStream<ArrayBuffer>
): ReadableStream<ArrayBuffer> {
  // TODO: Should a streaming decoder for iterables be formalised in the codec layer? What would that look like?
  return new ReadableStream({
    start(controller) {
      let rollingBuffer = new ArrayBuffer(BUFFER_CHUNK_SIZE)

      let size: number | null = null
      let hasFullHeader = false
      let readOffset = 0
      let writeOffset = 0

      const reader = stream.getReader()

      async function next() {
        const { done, value } = await reader.read()

        if (value) {
          rollingBuffer = writeToBuffer(rollingBuffer, value, writeOffset)
          writeOffset += value.byteLength

          // Take a view over the written bytes of the rolling buffer
          const view = new DataView(rollingBuffer, 0, writeOffset)

          if (size == null && view.byteLength > LIST_SIZE_BYTE_LENGTH) {
            size = view.getUint32(0, LITTLE_ENDIAN)
          }

          if (size != null && !hasFullHeader) {
            const headerByteLength =
              LIST_SIZE_BYTE_LENGTH + size * FIELD_OFFSET_BYTE_LENGTH

            if (view.byteLength > headerByteLength) {
              hasFullHeader = true
              readOffset = headerByteLength
            }
          }

          if (hasFullHeader) {
            // Exhaust items from rolling buffer
            while (true) {
              const contentView = new DataView(
                rollingBuffer,
                readOffset,
                writeOffset - readOffset
              )

              const itemByteLength = contentView.getUint32(0, LITTLE_ENDIAN)

              if (
                contentView.byteLength >=
                BUFFER_SIZE_BYTE_LENGTH + itemByteLength
              ) {
                controller.enqueue(
                  rollingBuffer.slice(
                    readOffset + BUFFER_SIZE_BYTE_LENGTH,
                    readOffset + BUFFER_SIZE_BYTE_LENGTH + itemByteLength
                  )
                )

                readOffset += BUFFER_SIZE_BYTE_LENGTH + itemByteLength

                // Read next if more bytes on rolling buffer
                if (readOffset < writeOffset) {
                  continue
                }
              }

              // Exit and await next chunk
              break
            }
          }
        }

        if (done) {
          controller.close()
          return
        }

        return next()
      }

      next().catch(error => {
        controller.error(error)
      })
    },
  })
}
