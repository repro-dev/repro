import expect from 'expect'
import { describe, it } from 'node:test'
import { createExportedKey, decrypt, encrypt } from '.'

describe('Encryption', () => {
  it('should encrypt and decrypt a value', async () => {
    const input = 'this is a test value'
    const buffer = new TextEncoder().encode(input)
    const [encryptedValue, key] = await encrypt(buffer)
    const decryptedValue = await decrypt(encryptedValue, key)
    const output = new TextDecoder().decode(decryptedValue)
    expect(output).toEqual(input)
  })

  it('should encrypt and decrypt a value with a provided key', async () => {
    const input = 'this is a test value'
    const buffer = new TextEncoder().encode(input)
    const sharedKey = await createExportedKey()

    const [encryptedValue, exportedKey] = await encrypt(buffer, sharedKey)
    expect(sharedKey).toEqual(exportedKey)

    const decryptedValue = await decrypt(encryptedValue, sharedKey)
    const output = new TextDecoder().decode(decryptedValue)
    expect(output).toEqual(input)
  })
})
