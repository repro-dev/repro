import { ByteLengths } from './lib/constants'
import { AnyDescriptor } from './lib/descriptors'

export { getByteLength, getDataByteLength } from './lib/utils'

const VECTOR_COUNT_BYTE_LENGTH = ByteLengths.Int32
const VECTOR_OFFSET_ENTRY_BYTE_LENGTH = ByteLengths.Int32
const BUFFER_SIZE_BYTE_LENGTH = ByteLengths.Int32

export function getVectorHeaderByteLength(length: number): number {
  return VECTOR_COUNT_BYTE_LENGTH + length * VECTOR_OFFSET_ENTRY_BYTE_LENGTH
}

export function getBufferFrameByteLength(): number {
  return BUFFER_SIZE_BYTE_LENGTH
}

export function getHeaderByteLength(descriptor: AnyDescriptor, data: any): number {
  if (descriptor.type === 'vector') {
    return getVectorHeaderByteLength((data as any[]).length)
  }
  return 0
}
