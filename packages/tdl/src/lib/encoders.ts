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
import { prof, report, reset } from './profile'
import {
  EncodeContext,
  PointerRef,
  createDataView,
  createEncodeContext,
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
  pointerRef: PointerRef = createPointerRef(),
  ctx?: EncodeContext
) {
  // Use ctx for cached byte length (avoids re-scanning code points)
  const byteLength = getDataByteLength(descriptor, data, ctx)

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
  pointerRef: PointerRef = createPointerRef(),
  ctx?: EncodeContext
) {
  const byteLength = getDataByteLength(descriptor, data, ctx)
  view.setUint32(pointerRef.offset, byteLength, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int32

  // Bulk copy via Uint8Array .set (handles typed-array views with non-zero byteOffset)
  const srcU8 = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)
  new Uint8Array(view.buffer, pointerRef.offset, byteLength).set(
    srcU8.subarray(0, byteLength)
  )
  pointerRef.offset += byteLength

  return view
}

export function encodeStruct(
  descriptor: StructDescriptor,
  data: any,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef(),
  ctx?: EncodeContext
) {
  const headerByteLength =
    ByteLengths.Int16 + descriptor.fields.length * ByteLengths.Int32

  // Prepend field encoded count to support back/foward-compat
  view.setUint16(pointerRef.offset, descriptor.fields.length, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int16

  let fieldPointer = headerByteLength
  const childSizes = ctx?.childSizes.get(data)
  const sizes = childSizes as number[] | undefined

  for (const [i, [name, fieldDescriptor]] of descriptor.fields.entries()) {
    view.setUint32(pointerRef.offset, fieldPointer, LITTLE_ENDIAN)
    // Use cached child size when available, avoiding re-computation
    fieldPointer +=
      sizes !== undefined
        ? sizes[i]!
        : getByteLength(fieldDescriptor, data[name], ctx)
    pointerRef.offset += ByteLengths.Int32
  }

  for (const [name, fieldDescriptor] of descriptor.fields) {
    encodeProperty(fieldDescriptor, data[name], view, pointerRef, ctx)
  }

  return view
}

export function encodeArray(
  descriptor: ArrayDescriptor,
  data: any[],
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef(),
  ctx?: EncodeContext
) {
  for (let i = 0; i < descriptor.size; i++) {
    encodeProperty(descriptor.items, data[i], view, pointerRef, ctx)
  }

  return view
}

export function encodeVector(
  descriptor: VectorDescriptor,
  data: any[],
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef(),
  ctx?: EncodeContext
) {
  const size = data.length
  const headerByteLength = ByteLengths.Int32 + size * ByteLengths.Int32

  view.setUint32(pointerRef.offset, size, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int32

  let itemPointer = headerByteLength
  const itemSizes = ctx?.childSizes.get(data)
  const sizes = itemSizes as number[] | undefined

  for (const [i, item] of data.entries()) {
    view.setUint32(pointerRef.offset, itemPointer, LITTLE_ENDIAN)
    itemPointer +=
      sizes !== undefined
        ? sizes[i]!
        : getByteLength(descriptor.items, item, ctx)
    pointerRef.offset += ByteLengths.Int32
  }

  for (const item of data) {
    encodeProperty(descriptor.items, item, view, pointerRef, ctx)
  }

  return view
}

export function encodeMap(
  descriptor: MapDescriptor,
  data: any,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef(),
  ctx?: EncodeContext
) {
  const entries = Object.entries(data)
  view.setUint32(pointerRef.offset, entries.length, LITTLE_ENDIAN)
  pointerRef.offset += ByteLengths.Int32

  const sizes = ctx?.childSizes.get(data) as number[] | undefined
  const N = entries.length

  const headerByteLength = entries.reduce((acc, [key], i) => {
    const keySize =
      sizes !== undefined ? sizes[i]! : getByteLength(descriptor.key, key, ctx)
    return acc + keySize + ByteLengths.Int32
  }, ByteLengths.Int32)

  let offsetPointer = headerByteLength

  for (const [i, [key, value]] of entries.entries()) {
    encodeProperty(descriptor.key, key, view, pointerRef, ctx)
    view.setUint32(pointerRef.offset, offsetPointer, LITTLE_ENDIAN)
    pointerRef.offset += ByteLengths.Int32
    const valSize =
      sizes !== undefined
        ? sizes[N + i]!
        : getByteLength(descriptor.value, value, ctx)
    offsetPointer += valSize
  }

  for (const [, value] of entries) {
    encodeProperty(descriptor.value, value, view, pointerRef, ctx)
  }

  return view
}

export function encodeUnion(
  descriptor: UnionDescriptor,
  data: Box<any>,
  view: DataView = createDataView(getByteLength(descriptor, data)),
  pointerRef: PointerRef = createPointerRef(),
  ctx?: EncodeContext
) {
  const { tagField, descriptors } = descriptor
  const value = data.unwrap()

  const tag = value[tagField]
  view.setUint8(pointerRef.offset, tag)
  pointerRef.offset += ByteLengths.Int8

  encodeStruct(
    descriptors[tag] as StructDescriptor,
    value,
    view,
    pointerRef,
    ctx
  )

  return view
}

export function encodeProperty(
  descriptor: AnyDescriptor,
  data: any,
  view?: DataView,
  pointerRef: PointerRef = createPointerRef(),
  ctxArg?: EncodeContext
): DataView {
  // Top-level entry detection: when view is undefined, create the per-encode context
  // and run the size pass (which populates childSizes and stringByteLengths).
  let dv: DataView
  let ctx: EncodeContext | undefined

  if (view === undefined) {
    ctx = createEncodeContext()
    dv = createDataView(getByteLength(descriptor, data, ctx))
  } else {
    dv = view
    ctx = ctxArg
  }

  if (prof.enabled) {
    if (prof.profilingCycle === 1) {
      prof.sizePassEndMs = performance.now()
      prof.profilingCycle = 2
      prof.writePassStartMs = performance.now()
    }
    prof.encodeDepth++
    if (prof.encodeDepth > prof.maxDepth) prof.maxDepth = prof.encodeDepth
    prof.incNodeWrites()
  }

  if (descriptor.nullable) {
    dv.setUint8(pointerRef.offset, data === null ? 0 : 1)
    pointerRef.offset += ByteLengths.Int8

    if (data === null) {
      if (prof.enabled) {
        prof.encodeDepth--
        if (prof.encodeDepth === 0) {
          prof.writePassEndMs = performance.now()
          report()
          reset()
        }
      }
      return dv
    }
  }

  switch (descriptor.type) {
    case 'integer':
      encodeInteger(descriptor, data, dv, pointerRef)
      break

    case 'float':
      encodeFloat(descriptor, data, dv, pointerRef)
      break

    case 'char':
      encodeChar(descriptor, data, dv, pointerRef)
      break

    case 'string':
      encodeString(descriptor, data, dv, pointerRef, ctx)
      break

    case 'uuid':
      encodeUUID(descriptor, data, dv, pointerRef)
      break

    case 'bool':
      encodeBoolean(descriptor, data, dv, pointerRef)
      break

    case 'buffer':
      encodeBuffer(descriptor, data, dv, pointerRef, ctx)
      break

    case 'struct':
      encodeStruct(descriptor, data, dv, pointerRef, ctx)
      break

    case 'vector':
      encodeVector(descriptor, data, dv, pointerRef, ctx)
      break

    case 'array':
      encodeArray(descriptor, data, dv, pointerRef, ctx)
      break

    case 'map':
      encodeMap(descriptor, data, dv, pointerRef, ctx)
      break

    case 'union':
      encodeUnion(descriptor, data, dv, pointerRef, ctx)
      break

    default:
      ensureUnreachable(descriptor)
  }

  if (prof.enabled) {
    prof.encodeDepth--
    if (prof.encodeDepth === 0) {
      prof.writePassEndMs = performance.now()
      report()
      reset()
    }
  }

  return dv
}
