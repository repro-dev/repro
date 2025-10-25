import { attemptP } from 'fluture'

const IV_BYTE_LENGTH = 12
const KEY_BIT_LENGTH = 128

async function exportKey(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return jwk.k as string
}

function importKey(key: string) {
  return crypto.subtle.importKey(
    'jwk',
    {
      alg: 'A128GCM',
      ext: true,
      k: key,
      key_ops: ['encrypt', 'decrypt'],
      kty: 'oct',
    },
    {
      name: 'AES-GCM',
      length: KEY_BIT_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  )
}

function generateIV() {
  const arr = new Uint8Array(IV_BYTE_LENGTH)
  return crypto.getRandomValues(arr)
}

function generateKey() {
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: KEY_BIT_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  )
}

export async function createExportedKey() {
  const key = await generateKey()
  return await exportKey(key)
}

export function createExportedKeyF() {
  return attemptP<Error, string>(() => createExportedKey())
}

export async function encrypt(
  data: ArrayBuffer,
  exportedKey?: string
): Promise<[ArrayBuffer, string]> {
  const key =
    exportedKey != null ? await importKey(exportedKey) : await generateKey()

  const iv = generateIV()

  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )

  const output = new Uint8Array(IV_BYTE_LENGTH + encryptedData.byteLength)
  output.set(iv, 0)
  output.set(new Uint8Array(encryptedData), IV_BYTE_LENGTH)

  return [output.buffer, exportedKey ?? (await exportKey(key))]
}

export function encryptF(data: ArrayBuffer, exportedKey?: string) {
  return attemptP<Error, [ArrayBuffer, string]>(() =>
    encrypt(data, exportedKey)
  )
}

export async function decrypt(
  buffer: ArrayBuffer,
  exportedKey: string
): Promise<ArrayBuffer> {
  const key = await importKey(exportedKey)
  const view = new Uint8Array(buffer)
  const iv = view.subarray(0, IV_BYTE_LENGTH)
  const data = view.subarray(IV_BYTE_LENGTH)

  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )
}

export function decryptF(data: ArrayBuffer, exportedKey: string) {
  return attemptP<Error, ArrayBuffer>(() => decrypt(data, exportedKey))
}
