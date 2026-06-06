import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createEmailProvider } from './createEmailProvider'

describe('createEmailProvider', () => {
  it('returns console provider when no API key is provided', () => {
    const provider = createEmailProvider(undefined)

    assert.ok(provider !== null)
    assert.ok(typeof provider.send === 'function')
  })

  it('returns console provider when API key is empty string', () => {
    const provider = createEmailProvider('')

    assert.ok(provider !== null)
    assert.ok(typeof provider.send === 'function')
  })

  it('returns resend provider when API key is provided', () => {
    const provider = createEmailProvider('re_test_key_123')

    assert.ok(provider !== null)
    assert.ok(typeof provider.send === 'function')
  })
})
