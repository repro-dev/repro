import { Box } from './Box'
import { ByteLengths, LITTLE_ENDIAN } from './constants'
import {
  AnyDescriptor,
  ArrayDescriptor,
  BooleanDescriptor,
  BufferDescriptor,
  CharDescriptor,
  FloatDescriptor,
  IntegerDescriptor,
  MapDescriptor,
  StringDescriptor,
  StructDescriptor,
  UUIDDescriptor,
  UnionDescriptor,
  VectorDescriptor,
} from './descriptors'
import {
  PointerRef,
  createDataView,
  createPointerRef,
  ensureUnreachable,
  getByteLength,
  getDataByteLength,
} from './utils'

export function encodeInteger(
  descriptor: IntegerDescriptor,
  data: number | bigint,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const { signed, bits } = descriptor

  if (bits === 64) {
    const method = `set${signed ? 'BigInt' : 'BigUint'}64` as const
    view[method](pointerRef.offset, BigInt(data), LITTLE_ENDIAN)
    pointerRef.offset += 8
    return view
  }

  const method = `set${signed ? 'Int' : 'Uint'}${bits}` as const
  view[method](pointerRef.offset, Number(data), LITTLE_ENDIAN)
  pointerRef.offset += bits / 8
  return view
}

export function encodeFloat(
  descriptor: FloatDescriptor,
  data: number,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const { bits } = descriptor
  const method = `setFloat${bits}` as const
  view[method](pointerRef.offset, data, LITTLE_ENDIAN)
  pointerRef.offset += bits / 8
  return view
}

const textEncoder = new TextEncoder()

export function encodeChar(
  descriptor: CharDescriptor,
  data: string,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const { bytes } = descriptor
  const dest = new Uint8Array(view.buffer, pointerRef.offset)
  textEncoder.encodeInto(data, dest)
  pointerRef.offset += bytes
  return view
}

export function encodeString(
  descriptor: StringDescriptor,
  data: string,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const byteLength = getDataByteLength(descriptor, data)

  view.setUint32(pointerRef.offset, byteLength, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int32

  const dest = new Uint8Array(view.buffer, pointerRef.offset)
  textEncoder.encodeInto(data, dest)
  pointerRef.offset += byteLength

  return view
}

export function encodeUUID(
  descriptor: UUIDDescriptor,
  data: string,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const bytes = data
    .replace(/-/g, '')
    .match(/.{2}/g)!
    .map(byte => parseInt(byte, 16))

  for (const byte of bytes) {
    view.setUint8(pointerRef.offset, byte)
    pointerRef.offset += ByteLengths.Int8
  }

  return view
}

export function encodeBoolean(
  descriptor: BooleanDescriptor,
  data: boolean,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  view.setUint8(pointerRef.offset, data ? 1 : 0)
  pointerRef.offset += ByteLengths.Int8
  return view
}

export function encodeBuffer(
  descriptor: BufferDescriptor,
  data: ArrayBufferLike,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const byteLength = getDataByteLength(descriptor, data)
  view.setUint32(pointerRef.offset, byteLength, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int32

  const src = !ArrayBuffer.isView(data)
    ? new DataView(data)
    : new DataView(data, data.byteOffset, data.byteLength)

  for (let i = 0; i < byteLength; i++) {
    view.setUint8(pointerRef.offset, src.getUint8(i))
    pointerRef.offset += ByteLengths.Int8
  }

  return view
}

export function encodeStruct(
  descriptor: StructDescriptor,
  data: any,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const headerByteLength =
    ByteLengths.Int16 + descriptor.fields.length * ByteLengths.Int32

  // Prepend field encoded count to support back/foward-compat
  view.setUint16(pointerRef.offset, descriptor.fields.length, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int16

  let fieldPointer = headerByteLength

  for (const [name, fieldDescriptor] of descriptor.fields) {
    view.setUint32(pointerRef.offset, fieldPointer, LITTLE_ENDIAN)
    fieldPointer += getByteLength(fieldDescriptor, data[name])
    pointerRef.offset += ByteLengths.Int32
  }

  for (const [name, fieldDescriptor] of descriptor.fields) {
    encodeProperty(fieldDescriptor, data[name], view, pointerRef)
  }

  return view
}

export function encodeArray(
  descriptor: ArrayDescriptor,
  data: any[],
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  for (let i = 0; i < descriptor.size; i++) {
    encodeProperty(descriptor.items, data[i], view, pointerRef)
  }

  return view
}

export function encodeVector(
  descriptor: VectorDescriptor,
  data: any[],
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const size = data.length
  const headerByteLength = ByteLengths.Int32 + size * ByteLengths.Int32

  view.setUint32(pointerRef.offset, size, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int32

  let itemPointer = headerByteLength

  for (const item of data) {
    view.setUint32(pointerRef.offset, itemPointer, LITTLE_ENDIAN)
    itemPointer += getByteLength(descriptor.items, item)
    pointerRef.offset += ByteLengths.Int32
  }

  for (const item of data) {
    encodeProperty(descriptor.items, item, view, pointerRef)
  }

  return view
}

export function encodeMap(
  descriptor: MapDescriptor,
  data: any,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const entries = Object.entries(data)
  view.setUint32(pointerRef.offset, entries.length, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int32

  const headerByteLength = entries.reduce((acc, [key]) => {
    return acc + getByteLength(descriptor.key, key) + ByteLengths.Int32
  }, ByteLengths.Int32)

  let offsetPointer = headerByteLength

  for (const [key, value] of entries) {
    encodeProperty(descriptor.key, key, view, pointerRef)
    view.setUint32(pointerRef.offset, offsetPointer, LITTLE_ENDIAN)
    pointerRef.offset += ByteLengths.Int32
    offsetPointer += getByteLength(descriptor.value, value)
  }

  for (const [, value] of entries) {
    encodeProperty(descriptor.value, value, view, pointerRef)
  }

  return view
}

export function encodeUnion(
  descriptor: UnionDescriptor,
  data: Box<any>,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  const { tagField, descriptors } = descriptor
  const value = data.unwrap()

  const tag = value[tagField]
  view.setUint8(pointerRef.offset, tag)
  pointerRef.offset += ByteLengths.Int8

  encodeStruct(descriptors[tag] as StructDescriptor, value, view, pointerRef)

  return view
}

export function encodeProperty(
  descriptor: AnyDescriptor,
  data: any,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef()
) {
  if (descriptor.nullable) {
    view.setUint8(pointerRef.offset, data === null ? 0 : 1)
    pointerRef.offset += ByteLengths.Int8

    if (data === null) {
      return view
    }
  }

  switch (descriptor.type) {
    case 'integer':
      encodeInteger(descriptor, data, view, pointerRef)
      break

    case 'float':
      encodeFloat(descriptor, data, view, pointerRef)
      break

    case 'char':
      encodeChar(descriptor, data, view, pointerRef)
      break

    case 'string':
      encodeString(descriptor, data, view, pointerRef)
      break

    case 'uuid':
      encodeUUID(descriptor, data, view, pointerRef)
      break

    case 'bool':
      encodeBoolean(descriptor, data, view, pointerRef)
      break

    case 'buffer':
      encodeBuffer(descriptor, data, view, pointerRef)
      break

    case 'struct':
      encodeStruct(descriptor, data, view, pointerRef)
      break

    case 'vector':
      encodeVector(descriptor, data, view, pointerRef)
      break

    case 'array':
      encodeArray(descriptor, data, view, pointerRef)
      break

    case 'map':
      encodeMap(descriptor, data, view, pointerRef)
      break

    case 'union':
      encodeUnion(descriptor, data, view, pointerRef)
      break

    default:
      ensureUnreachable(descriptor)
  }

  return view
}
