const BYTES_PREFIX = '__REPRO_BUF:'

export function toByteString(bytes: Uint8Array): string {
  let output = ''

  for (const byte of bytes) {
    output += String.fromCharCode(byte)
  }

  return BYTES_PREFIX + btoa(output)
}

export function fromByteString(input: string): Uint8Array {
  if (typeof input !== 'string') {
    throw new TypeError(
      `Cannot deserialize byte string. Invalid type: (${typeof input})`
    )
  }

  if (!input.startsWith(BYTES_PREFIX)) {
    throw new Error('Invalid byte encoding: missing prefix')
  }

  const decodedInput = atob(input.slice(BYTES_PREFIX.length))
  const bytes = new Uint8Array(decodedInput.length)
  let offset = 0

  for (const char of decodedInput) {
    bytes[offset] = char.charCodeAt(0)
    offset += 1
  }

  return bytes
}

export function toJSON(data: any): string {
  return JSON.stringify(data, (_, value) => {
    if (value instanceof ArrayBuffer) {
      return toByteString(new Uint8Array(value))
    }

    if (ArrayBuffer.isView(value)) {
      return toByteString(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      )
    }

    return value
  })
}

export function fromJSON(data: string): any {
  return JSON.parse(data, (_, value) => {
    if (typeof value === 'string' && value.startsWith(BYTES_PREFIX)) {
      return fromByteString(value).buffer
    }

    return value
  })
}

export function toWireFormat(data: any): string {
  const textEncoder = new TextEncoder()
  return toByteString(textEncoder.encode(toJSON(data)))
}

export function fromWireFormat(data: string): any {
  const textDecoder = new TextDecoder()
  return fromJSON(textDecoder.decode(fromByteString(data)))
}
