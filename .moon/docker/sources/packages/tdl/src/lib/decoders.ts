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
import { encodeProperty } from './encoders'
import {
  createPointerRef,
  ensureUnreachable,
  getByteLength,
  getDefaultValue,
  isFixedLengthProperty,
} from './utils'

export function decodeInteger(
  descriptor: IntegerDescriptor,
  view: DataView,
  byteOffset: number
) {
  const { signed, bits } = descriptor

  const method =
    bits === 64
      ? (`get${signed ? 'BigInt' : 'BigUint'}64` as const)
      : (`get${signed ? 'Int' : 'Uint'}${bits}` as const)

  return view[method](byteOffset, LITTLE_ENDIAN)
}

export function decodeFloat(
  descriptor: FloatDescriptor,
  view: DataView,
  byteOffset: number
) {
  const { bits } = descriptor
  const method = `getFloat${bits}` as const
  return view[method](byteOffset, LITTLE_ENDIAN)
}

const textDecoder = new TextDecoder()

export function decodeChar(
  descriptor: CharDescriptor,
  view: DataView,
  byteOffset: number
) {
  const { bytes } = descriptor
  const data = textDecoder.decode(new DataView(view.buffer, byteOffset, bytes))
  byteOffset += bytes

  return data
}

export function decodeString(
  _: StringDescriptor,
  view: DataView,
  byteOffset: number
) {
  const byteLength = view.getUint32(byteOffset, LITTLE_ENDIAN)
  byteOffset += ByteLengths.Int32
  return textDecoder.decode(new DataView(view.buffer, byteOffset, byteLength))
}

export function decodeUUID(
  descriptor: UUIDDescriptor,
  view: DataView,
  byteOffset: number
) {
  const byteLength = getByteLength(descriptor, null)
  const bytes: Array<number> = []

  for (let i = 0; i < byteLength; i++) {
    bytes.push(view.getUint8(byteOffset + i))
  }

  const chars = bytes.map(byte => byte.toString(16).padStart(2, '0'))

  return [
    chars.slice(0, 4).join(''),
    chars.slice(4, 6).join(''),
    chars.slice(6, 8).join(''),
    chars.slice(8, 10).join(''),
    chars.slice(10, 16).join(''),
  ].join('-')
}

export function decodeBoolean(
  _: BooleanDescriptor,
  view: DataView,
  byteOffset: number
) {
  return !!view.getUint8(byteOffset)
}

export function decodeBuffer(
  _: BufferDescriptor,
  view: DataView,
  byteOffset: number
) {
  const byteLength = view.getUint32(byteOffset, LITTLE_ENDIAN)
  byteOffset += ByteLengths.Int32
  return view.buffer.slice(byteOffset, byteOffset + byteLength)
}

export function decodeStruct(
  descriptor: StructDescriptor,
  view: DataView,
  byteOffset: number
) {
  const { fields } = descriptor
  const struct: any = {}
  const initialOffset = byteOffset
  const encodedFieldsLength = view.getUint16(byteOffset, LITTLE_ENDIAN)
  byteOffset += ByteLengths.Int16

  for (let i = 0, len = fields.length; i < len; i++) {
    const field = fields[i]

    if (!field) {
      continue
    }

    const [key, itemDescriptor] = field

    // If field does not exist on the encoded buffer
    // set default value for descriptor for backwards-
    // compatibility
    if (i >= encodedFieldsLength) {
      struct[key] = getDefaultValue(itemDescriptor)
      continue
    }

    const fieldByteOffset =
      initialOffset + view.getUint32(byteOffset, LITTLE_ENDIAN)
    byteOffset += ByteLengths.Int32
    struct[key] = decodeProperty(itemDescriptor, view, fieldByteOffset)
  }

  return struct
}

export function decodeStructLazy(
  descriptor: StructDescriptor,
  view: DataView,
  byteOffset: number
) {
  const { fields } = descriptor
  const struct: any = {}
  const initialOffset = byteOffset
  const encodedFieldsLength = view.getUint16(initialOffset, LITTLE_ENDIAN)
  byteOffset += ByteLengths.Int16

  for (let i = 0, len = fields.length; i < len; i++) {
    const field = fields[i]

    if (!field) {
      continue
    }

    const [key, itemDescriptor] = field

    Object.defineProperty(struct, key, {
      enumerable: true,

      get() {
        // If field does not exist on the encoded buffer
        // return default value for descriptor for backwards-
        // compatibility
        if (i >= encodedFieldsLength) {
          return getDefaultValue(itemDescriptor)
        }

        const fieldByteOffset =
          initialOffset +
          view.getUint32(byteOffset + i * ByteLengths.Int32, LITTLE_ENDIAN)
        return decodePropertyLazy(itemDescriptor, view, fieldByteOffset)
      },

      set(value) {
        if (!isFixedLengthProperty(itemDescriptor)) {
          throw new Error(`Cannot overwrite variable length field ${key}`)
        }

        if (i >= encodedFieldsLength) {
          throw new Error(
            `Cannot overwrite field ${key} that does not exist on the underlying buffer`
          )
        }

        if (itemDescriptor.nullable) {
          throw new Error(`Cannot overwrite nullable field ${key}`)
        }

        const fieldByteOffset =
          initialOffset +
          view.getUint32(byteOffset + i * ByteLengths.Int32, LITTLE_ENDIAN)
        return encodeProperty(
          itemDescriptor,
          value,
          view,
          createPointerRef(fieldByteOffset)
        )
      },
    })
  }

  return struct
}

export function decodeArray(
  descriptor: ArrayDescriptor,
  view: DataView,
  byteOffset: number
) {
  const { size, items } = descriptor
  const array: any[] = []

  for (let i = 0; i < size; i++) {
    array.push(decodeProperty(items, view, byteOffset))
    byteOffset += getByteLength(items, null)
  }

  return array
}

export function decodeArrayLazy(
  descriptor: ArrayDescriptor,
  view: DataView,
  byteOffset: number
): Array<any> {
  const { size, items } = descriptor
  const byteLength = getByteLength(items, null)

  function isIndexInBounds(n: number) {
    return n >= 0 && n < size
  }

  function isNumericalProperty(prop: string | symbol) {
    return typeof prop === 'string' && /\d+/.test(prop)
  }

  const keys: Array<string | symbol> = Array.from({ length: size }, (_, i) =>
    String(i)
  )

  return new Proxy<Array<any>>(new Array(size), {
    get(target, prop, receiver) {
      if (isNumericalProperty(prop)) {
        const index = Number(prop)

        if (!isIndexInBounds(index)) {
          return undefined
        }

        return decodePropertyLazy(items, view, byteOffset + index * byteLength)
      }

      return Reflect.get(target, prop, receiver)
    },

    has(target, prop) {
      if (isNumericalProperty(prop)) {
        const index = Number(prop)
        return isIndexInBounds(index)
      }

      return Reflect.has(target, prop)
    },

    ownKeys(target) {
      return keys.concat(Reflect.ownKeys(target))
    },

    getOwnPropertyDescriptor(target, prop) {
      if (isNumericalProperty(prop)) {
        return {
          configurable: true,
          enumerable: true,
          value: target[prop as any],
        }
      }

      return Reflect.getOwnPropertyDescriptor(target, prop)
    },
  })
}

export function decodeVector(
  descriptor: VectorDescriptor,
  view: DataView,
  byteOffset: number
) {
  const initialOffset = byteOffset

  const size = view.getUint32(byteOffset, LITTLE_ENDIAN)
  byteOffset += ByteLengths.Int32

  const vector: any[] = []

  for (let i = 0; i < size; i++) {
    const valueByteOffset =
      initialOffset + view.getUint32(byteOffset, LITTLE_ENDIAN)
    byteOffset += ByteLengths.Int32
    vector.push(decodeProperty(descriptor.items, view, valueByteOffset))
  }

  return vector
}

export function decodeVectorLazy(
  descriptor: VectorDescriptor,
  view: DataView,
  byteOffset: number
): Array<any> {
  const initialOffset = byteOffset

  const size = view.getUint32(byteOffset, LITTLE_ENDIAN)
  byteOffset += ByteLengths.Int32

  function isIndexInBounds(n: number) {
    return n >= 0 && n < size
  }

  function isNumericalProperty(prop: string | symbol) {
    return typeof prop === 'string' && /\d+/.test(prop)
  }

  const keys: Array<string | symbol> = Array.from({ length: size }, (_, i) =>
    String(i)
  )

  return new Proxy<Array<any>>(new Array(size), {
    get(target, prop, receiver) {
      if (isNumericalProperty(prop)) {
        const index = Number(prop)

        if (!isIndexInBounds(index)) {
          return undefined
        }

        const valueByteOffset =
          initialOffset +
          view.getUint32(byteOffset + index * ByteLengths.Int32, LITTLE_ENDIAN)
        return decodePropertyLazy(descriptor.items, view, valueByteOffset)
      }

      return Reflect.get(target, prop, receiver)
    },

    has(target, prop) {
      if (isNumericalProperty(prop)) {
        const index = Number(prop)
        return isIndexInBounds(index)
      }

      return Reflect.has(target, prop)
    },

    ownKeys(target) {
      return keys.concat(Reflect.ownKeys(target))
    },

    getOwnPropertyDescriptor(target, prop) {
      if (isNumericalProperty(prop)) {
        return {
          configurable: true,
          enumerable: true,
          value: target[prop as any],
        }
      }

      return Reflect.getOwnPropertyDescriptor(target, prop)
    },
  })
}

export function decodeMap(
  descriptor: MapDescriptor,
  view: DataView,
  byteOffset: number
) {
  const initialOffset = byteOffset
  const size = view.getUint32(byteOffset, LITTLE_ENDIAN)
  byteOffset += ByteLengths.Int32

  const keys: Array<[string, number]> = []

  for (let i = 0; i < size; i++) {
    const key = decodeProperty(descriptor.key, view, byteOffset)
    const keyByteLength = getByteLength(descriptor.key, key)
    byteOffset += keyByteLength

    const valueOffset = view.getUint32(byteOffset, LITTLE_ENDIAN)
    byteOffset += ByteLengths.Int32

    keys.push([key, valueOffset])
  }

  const map: any = {}

  for (const [key, valueOffset] of keys) {
    const valueByteOffset = initialOffset + valueOffset
    map[key] = decodeProperty(descriptor.value, view, valueByteOffset)
  }

  return map
}

export function decodeMapLazy(
  descriptor: MapDescriptor,
  view: DataView,
  byteOffset: number
) {
  const initialOffset = byteOffset
  const size = view.getUint32(byteOffset, LITTLE_ENDIAN)
  byteOffset += ByteLengths.Int32

  const keys: Array<[string, number]> = []

  for (let i = 0; i < size; i++) {
    const key = decodeProperty(descriptor.key, view, byteOffset)
    const keyByteLength = getByteLength(descriptor.key, key)
    byteOffset += keyByteLength

    const valueOffset = view.getUint32(byteOffset, LITTLE_ENDIAN)
    byteOffset += ByteLengths.Int32

    keys.push([key, valueOffset])
  }

  const map: any = {}

  for (const [key, valueOffset] of keys) {
    const valueByteOffset = initialOffset + valueOffset

    Object.defineProperty(map, key, {
      enumerable: true,

      get() {
        return decodePropertyLazy(descriptor.value, view, valueByteOffset)
      },
    })
  }

  return map
}

function decodeUnionValueDescriptor(
  descriptor: UnionDescriptor,
  view: DataView,
  byteOffset: number
) {
  const { descriptors } = descriptor

  const tag = view.getUint8(byteOffset)
  return descriptors[tag]
}

export function decodeUnion(
  descriptor: UnionDescriptor,
  view: DataView,
  byteOffset: number
) {
  const valueDescriptor = decodeUnionValueDescriptor(
    descriptor,
    view,
    byteOffset
  )

  byteOffset += ByteLengths.Int8

  if (valueDescriptor == null) {
    return new Box(null)
  }

  return new Box(decodeStruct(valueDescriptor!, view, byteOffset))
}

export function decodeUnionLazy(
  descriptor: UnionDescriptor,
  view: DataView,
  byteOffset: number
) {
  const valueDescriptor = decodeUnionValueDescriptor(
    descriptor,
    view,
    byteOffset
  )

  byteOffset += ByteLengths.Int8

  if (valueDescriptor == null) {
    return new Box(null)
  }

  return new Box(decodeStructLazy(valueDescriptor!, view, byteOffset))
}

export function decodeProperty(
  descriptor: AnyDescriptor,
  view: DataView,
  byteOffset: number = 0
) {
  if (descriptor.nullable) {
    const isNull = view.getUint8(byteOffset) === 0
    byteOffset += ByteLengths.Int8

    if (isNull) {
      return null
    }
  }

  switch (descriptor.type) {
    case 'integer':
      return decodeInteger(descriptor, view, byteOffset)

    case 'float':
      return decodeFloat(descriptor, view, byteOffset)

    case 'char':
      return decodeChar(descriptor, view, byteOffset)

    case 'string':
      return decodeString(descriptor, view, byteOffset)

    case 'uuid':
      return decodeUUID(descriptor, view, byteOffset)

    case 'bool':
      return decodeBoolean(descriptor, view, byteOffset)

    case 'buffer':
      return decodeBuffer(descriptor, view, byteOffset)

    case 'struct':
      return decodeStruct(descriptor, view, byteOffset)

    case 'vector':
      return decodeVector(descriptor, view, byteOffset)

    case 'array':
      return decodeArray(descriptor, view, byteOffset)

    case 'map':
      return decodeMap(descriptor, view, byteOffset)

    case 'union':
      return decodeUnion(descriptor, view, byteOffset)

    default:
      ensureUnreachable(descriptor)
  }
}

export function decodePropertyLazy(
  descriptor: AnyDescriptor,
  view: DataView,
  byteOffset: number = 0
) {
  if (descriptor.nullable) {
    const isNull = view.getUint8(byteOffset) === 0
    byteOffset += ByteLengths.Int8

    if (isNull) {
      return null
    }
  }

  switch (descriptor.type) {
    case 'struct':
      return decodeStructLazy(descriptor, view, byteOffset)

    case 'vector':
      return decodeVectorLazy(descriptor, view, byteOffset)

    case 'array':
      return decodeArrayLazy(descriptor, view, byteOffset)

    case 'map':
      return decodeMapLazy(descriptor, view, byteOffset)

    case 'union':
      return decodeUnionLazy(descriptor, view, byteOffset)

    default:
      // If type is nullable, rewind byteOffset as `decodeProperty`
      // will check the null byte again
      if (descriptor.nullable) {
        byteOffset -= ByteLengths.Int8
      }

      return decodeProperty(descriptor, view, byteOffset)
  }
}
