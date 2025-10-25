import { Box } from './Box'
import { ByteLengths } from './constants'
import { AnyDescriptor, StructDescriptor } from './descriptors'
import { isLens, unwrapLens } from './view'

export function copy(view: DataView): DataView {
  const buffer = new ArrayBuffer(view.byteLength)
  const dest = new DataView(buffer)

  for (let i = 0; i < view.byteLength; i++) {
    dest.setUint8(i, view.getUint8(i))
  }

  return dest
}

export function approxByteLength(obj: any): number {
  if (obj && obj.byteLength !== undefined) {
    return obj.byteLength
  }

  if (isLens(obj)) {
    return unwrapLens(obj).byteLength
  }

  if (typeof obj === 'string') {
    return obj.length * 2
  }

  if (typeof obj === 'number') {
    return 8
  }

  if (typeof obj === 'boolean') {
    return 4
  }

  if (typeof obj === 'object') {
    if (!obj) {
      return 0
    }

    if (Array.isArray(obj)) {
      return obj.map(approxByteLength).reduce((a, b) => a + b, 0)
    }

    return Object.entries(obj)
      .flatMap(entry => entry.map(approxByteLength))
      .reduce((a, b) => a + b, 0)
  }

  return 0
}

export function getDataByteLength(
  descriptor: AnyDescriptor,
  data: any
): number {
  const { type, nullable } = descriptor

  if (nullable && data === null) {
    return 0
  }

  if (type === 'char') {
    return descriptor.bytes
  }

  if (type === 'bool') {
    return ByteLengths.Int8
  }

  if (type === 'integer') {
    return descriptor.bits / 8
  }

  if (type === 'float') {
    return descriptor.bits / 8
  }

  if (type === 'buffer') {
    return data.byteLength
  }

  if (type === 'string') {
    let byteLength = 0

    if (typeof data === 'string') {
      for (let i = 0, len = data.length; i < len; i++) {
        const codePoint = data.codePointAt(i)

        if (codePoint === undefined) {
          continue
        }

        if (codePoint < 0x0080) {
          byteLength += ByteLengths.Int8
        } else if (codePoint < 0x0800) {
          byteLength += ByteLengths.Int16
        } else if (codePoint < 0x10000) {
          byteLength += ByteLengths.Int8 + ByteLengths.Int16
        } else {
          byteLength += ByteLengths.Int32
        }
      }
    }

    return byteLength
  }

  if (type === 'uuid') {
    return 16
  }

  return 0
}

export function getByteLength(descriptor: AnyDescriptor, data: any): number {
  const { type, nullable } = descriptor

  if (nullable && data === null) {
    return ByteLengths.Int8
  }

  if (type === 'char') {
    return (
      (nullable ? ByteLengths.Int8 : 0) + getDataByteLength(descriptor, data)
    )
  }

  if (type === 'bool') {
    return (
      (nullable ? ByteLengths.Int8 : 0) + getDataByteLength(descriptor, data)
    )
  }

  if (type === 'integer') {
    return (
      (nullable ? ByteLengths.Int8 : 0) + getDataByteLength(descriptor, data)
    )
  }

  if (type === 'float') {
    return (
      (nullable ? ByteLengths.Int8 : 0) + getDataByteLength(descriptor, data)
    )
  }

  if (type === 'buffer') {
    return (
      (nullable ? ByteLengths.Int8 : 0) +
      ByteLengths.Int32 +
      getDataByteLength(descriptor, data)
    )
  }

  if (type === 'string') {
    return (
      (nullable ? ByteLengths.Int8 : 0) +
      ByteLengths.Int32 +
      getDataByteLength(descriptor, data)
    )
  }

  if (type === 'uuid') {
    return (
      (nullable ? ByteLengths.Int8 : 0) + getDataByteLength(descriptor, data)
    )
  }

  if (type === 'array') {
    return (
      (nullable ? ByteLengths.Int8 : 0) +
      descriptor.size * getByteLength(descriptor.items, data[0])
    )
  }

  if (type === 'vector') {
    return (
      (nullable ? ByteLengths.Int8 : 0) +
      ByteLengths.Int32 +
      data.length * ByteLengths.Int32 +
      (data as any[])
        .map(item => getByteLength(descriptor.items, item))
        .reduce((a, b) => a + b, 0)
    )
  }

  if (type === 'struct') {
    return (
      (nullable ? ByteLengths.Int8 : 0) +
      ByteLengths.Int16 +
      descriptor.fields.length * ByteLengths.Int32 +
      descriptor.fields
        .map(([name, fieldDescriptor]) =>
          getByteLength(fieldDescriptor, data[name])
        )
        .reduce((a, b) => a + b, 0)
    )
  }

  if (type === 'map') {
    const entries = Object.entries(data)

    const keysByteLength = entries
      .flatMap(([key]) => [
        getByteLength(descriptor.key, key),
        ByteLengths.Int32,
      ])
      .reduce((a, b) => a + b, 0)

    const valuesByteLength = entries
      .map(([, value]) => getByteLength(descriptor.value, value))
      .reduce((a, b) => a + b, 0)

    return (
      (nullable ? ByteLengths.Int8 : 0) +
      ByteLengths.Int32 +
      keysByteLength +
      valuesByteLength
    )
  }

  if (type === 'union') {
    const { descriptors, tagField } = descriptor
    // FIXME: Guard against unboxed types at runtime
    if (!(data instanceof Box)) {
      console.trace()
    }
    const unwrappedData = data.unwrap()
    const childDescriptor = descriptors[
      unwrappedData[tagField]
    ] as StructDescriptor
    return (
      (nullable ? ByteLengths.Int8 : 0) +
      ByteLengths.Int8 +
      getByteLength(childDescriptor, unwrappedData)
    )
  }

  return 0
}

export function getDefaultValue(descriptor: AnyDescriptor): any {
  if (descriptor.nullable) {
    return null
  }

  switch (descriptor.type) {
    case 'integer':
    case 'float':
      return 0

    case 'string':
      return ''

    case 'char':
      return ' '.repeat(descriptor.bytes)

    case 'uuid':
      return '00000000-0000-0000-0000-000000000000'

    case 'bool':
      return false

    case 'buffer':
      return new ArrayBuffer(0)

    case 'map':
      return {}

    case 'vector':
      return []

    case 'array':
      return new Array(descriptor.size).fill(getDefaultValue(descriptor.items))

    case 'struct':
      const value: Record<string, unknown> = {}

      for (const [prop, propDescriptor] of descriptor.fields) {
        value[prop] = getDefaultValue(propDescriptor)
      }

      return value

    case 'union':
      const firstTag = Object.keys(descriptor.descriptors)[0]

      if (firstTag) {
        const structDescriptor = descriptor.descriptors[parseInt(firstTag, 10)]

        if (structDescriptor) {
          return getDefaultValue(structDescriptor)
        }
      }

      throw new Error('Could not get default value for union descriptor')

    default:
      ensureUnreachable(descriptor)
  }
}

export interface PointerRef {
  offset: number
}

export function createPointerRef(offset = 0): PointerRef {
  return { offset }
}

export function createDataView(byteLength: number): DataView {
  return new DataView(new ArrayBuffer(byteLength))
}

export function isFixedLengthProperty(descriptor: AnyDescriptor) {
  return ['char', 'bool', 'integer', 'float', 'enum', 'array'].includes(
    descriptor.type
  )
}

export function ensureUnreachable(_: never): never {
  throw new Error('Unreachable')
}
