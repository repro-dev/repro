import { ByteLengths } from './lib/constants'
import { AnyDescriptor } from './lib/descriptors'

/**
 * Low-level byte-layout helpers for advanced callers that need to reason about
 * TDL framing.
 *
 * Normal codec consumers should continue to use `View.encode()` /
 * `View.decode()` and treat the underlying layout as an implementation detail.
 *
 * These helpers exist for cases like upload-time metadata generation where
 * callers need encoded byte lengths or container framing information without
 * re-implementing TDL layout rules in product code.
 */
export { getByteLength, getDataByteLength } from './lib/utils'

const VECTOR_COUNT_BYTE_LENGTH = ByteLengths.Int32
const VECTOR_OFFSET_ENTRY_BYTE_LENGTH = ByteLengths.Int32
const BUFFER_SIZE_BYTE_LENGTH = ByteLengths.Int32

/**
 * Returns the byte length of a vector header for a given item count.
 *
 * A TDL vector header is encoded as:
 * - `u32` item count
 * - one `u32` item offset per entry
 */
export function getVectorHeaderByteLength(length: number): number {
  return VECTOR_COUNT_BYTE_LENGTH + length * VECTOR_OFFSET_ENTRY_BYTE_LENGTH
}

/**
 * Returns the framing byte length for a TDL `buffer` value.
 *
 * Buffers are length-prefixed with a single `u32` before the payload bytes.
 */
export function getBufferFrameByteLength(): number {
  return BUFFER_SIZE_BYTE_LENGTH
}

/**
 * Returns the header byte length for descriptor types that encode a distinct
 * header section before their payload.
 *
 * This is intentionally narrow and currently only models the container header
 * for vectors. Callers that need full encoded size should use
 * `getByteLength()` instead.
 */
export function getHeaderByteLength(descriptor: AnyDescriptor, data: any): number {
  if (descriptor.type === 'vector') {
    return getVectorHeaderByteLength((data as any[]).length)
  }
  return 0
}
