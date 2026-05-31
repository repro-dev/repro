import assert from 'node:assert'
import { describe, it } from 'node:test'
import { redactTextPayload } from './redaction'

describe('redactTextPayload', () => {
  it('redacts sensitive fields from JSON payloads', () => {
    const payload = JSON.stringify({
      username: 'john',
      password: 'super-secret',
      data: 'hello',
    })

    const result = redactTextPayload(payload)
    const parsed = JSON.parse(result)

    assert.strictEqual(parsed.password, '[MASKED]')
    assert.strictEqual(parsed.username, 'john')
    assert.strictEqual(parsed.data, 'hello')
  })

  it('redacts nested sensitive fields', () => {
    const payload = JSON.stringify({
      user: {
        token: 'abc123',
        name: 'John',
      },
    })

    const result = redactTextPayload(payload)
    const parsed = JSON.parse(result)

    assert.strictEqual(parsed.user.token, '[MASKED]')
    assert.strictEqual(parsed.user.name, 'John')
  })

  it('redacts authorization fields', () => {
    const payload = JSON.stringify({
      authorization: 'Bearer xyz789',
      body: 'hello',
    })

    const result = redactTextPayload(payload)
    const parsed = JSON.parse(result)

    assert.strictEqual(parsed.authorization, '[MASKED]')
    assert.strictEqual(parsed.body, 'hello')
  })

  it('handles non-JSON text via pattern matching', () => {
    const payload = 'Some random text without secrets'
    const result = redactTextPayload(payload)
    assert.strictEqual(result, payload)
  })

  it('returns masked for text containing secret patterns', () => {
    const payload = 'token=my-secret-key&data=hello'
    const result = redactTextPayload(payload)
    assert.strictEqual(result, '[MASKED]')
  })
})
