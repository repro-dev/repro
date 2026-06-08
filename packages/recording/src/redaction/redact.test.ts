import { Stats } from '@repro/diagnostics'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'

void describe('redact functions', () => {
  void describe('redactText', () => {
    it('preserves whitespace and replaces non-whitespace', async () => {
      const { redactText } = await import('./redact')
      assert.equal(redactText('hello'), '*****')
      assert.equal(redactText('hello world'), '***** *****')
      assert.equal(redactText('  '), '  ')
      assert.equal(redactText('a b'), '* *')
    })

    it('handles empty string', async () => {
      const { redactText } = await import('./redact')
      assert.equal(redactText(''), '')
    })

    it('handles unicode', async () => {
      const { redactText } = await import('./redact')
      assert.equal(redactText('héllo'), '*****')
      assert.equal(redactText('中文'), '**')
    })

    it('preserves newlines and tabs', async () => {
      const { redactText } = await import('./redact')
      const result = redactText('hello\nworld\t!')
      assert.equal(result, '*****\n*****\t*')
    })
  })

  void describe('isSensitiveKey', () => {
    it('detects known sensitive key patterns', async () => {
      const { isSensitiveKey } = await import('./redact')
      assert.ok(isSensitiveKey('authorization'))
      assert.ok(isSensitiveKey('Authorization'))
      assert.ok(isSensitiveKey('password'))
      assert.ok(isSensitiveKey('PASSWORD'))
      assert.ok(isSensitiveKey('token'))
      assert.ok(isSensitiveKey('secret'))
      assert.ok(isSensitiveKey('api_key'))
      assert.ok(isSensitiveKey('api-key'))
      assert.ok(isSensitiveKey('apikey'))
      assert.ok(isSensitiveKey('access-token'))
      assert.ok(isSensitiveKey('access_token'))
      assert.ok(isSensitiveKey('refresh-token'))
      assert.ok(isSensitiveKey('credit_card'))
      assert.ok(isSensitiveKey('ssn'))
      assert.ok(isSensitiveKey('iban'))
    })

    it('rejects benign keys', async () => {
      const { isSensitiveKey } = await import('./redact')
      assert.equal(isSensitiveKey('username'), false)
      assert.equal(isSensitiveKey('name'), false)
      assert.equal(isSensitiveKey('id'), false)
      assert.equal(isSensitiveKey('type'), false)
      assert.equal(isSensitiveKey(''), false)
    })
  })

  void describe('detectPii', () => {
    it('detects email addresses', async () => {
      const { detectPii } = await import('./redact')
      const result = detectPii('user@example.com')
      assert.ok(result.detected)
      assert.equal(result.category, 'Email')
    })

    it('detects credit card numbers (with Luhn)', async () => {
      const { detectPii } = await import('./redact')
      // Valid Luhn
      const result = detectPii('4111111111111111')
      assert.ok(result.detected)
      assert.equal(result.category, 'CreditCard')
      // Invalid Luhn should not detect
      assert.equal(detectPii('1234567890123456').detected, false)
    })

    it('detects IBANs', async () => {
      const { detectPii } = await import('./redact')
      const result = detectPii('DE89370400440532013000')
      assert.ok(result.detected)
      assert.equal(result.category, 'IBAN')
    })

    it('detects SSNs', async () => {
      const { detectPii } = await import('./redact')
      const result = detectPii('123-45-6789')
      assert.ok(result.detected)
      assert.equal(result.category, 'SSN')
    })

    it('detects JWT tokens', async () => {
      const { detectPii } = await import('./redact')
      const result = detectPii(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3j6Z1D7GqE3WgYcYjVZ0mPJkQvG8I6N0'
      )
      assert.ok(result.detected)
      assert.equal(result.category, 'AuthToken')
    })

    it('returns detected: false for clean strings', async () => {
      const { detectPii } = await import('./redact')
      assert.equal(detectPii('hello world').detected, false)
      assert.equal(detectPii('just some regular text').detected, false)
      assert.equal(detectPii('').detected, false)
    })
  })

  void describe('redactValue', () => {
    it('redacts strings with sensitive content', async () => {
      const { redactValue, MASKED_VALUE } = await import('./redact')
      const result = redactValue('user@example.com')
      assert.equal(result, MASKED_VALUE)
    })

    it('passes through non-sensitive strings', async () => {
      const { redactValue } = await import('./redact')
      assert.equal(redactValue('hello'), 'hello')
    })

    it('deep-redacts nested objects', async () => {
      const { redactValue, MASKED_VALUE } = await import('./redact')
      const obj = {
        name: 'John',
        email: 'john@example.com',
        metadata: {
          token: 'abc123',
          label: 'user',
        },
      }
      const result = redactValue(obj) as Record<string, unknown>
      assert.equal(result.name, 'John')
      assert.equal(result.email, MASKED_VALUE)
      assert.equal(
        (result.metadata as Record<string, unknown>).token,
        MASKED_VALUE
      )
      assert.equal((result.metadata as Record<string, unknown>).label, 'user')
    })

    it('handles arrays', async () => {
      const { redactValue, MASKED_VALUE } = await import('./redact')
      const arr = ['hello', 'john@example.com']
      const result = redactValue(arr) as Array<unknown>
      assert.equal(result[0], 'hello')
      assert.equal(result[1], MASKED_VALUE)
    })

    it('handles circular references', async () => {
      const { redactValue, MASKED_VALUE } = await import('./redact')
      const obj: Record<string, unknown> = { name: 'test' }
      obj.self = obj
      const result = redactValue(obj) as Record<string, unknown>
      assert.equal(result.name, 'test')
      assert.equal(result.self, MASKED_VALUE)
    })

    it('handles primitives', async () => {
      const { redactValue } = await import('./redact')
      assert.equal(redactValue(42), 42)
      assert.equal(redactValue(null), null)
      assert.equal(redactValue(undefined), undefined)
      assert.equal(redactValue(true), true)
    })
  })

  void describe('redactHeaders', () => {
    it('masks known sensitive header names', async () => {
      const { redactHeaders, MASKED_VALUE } = await import('./redact')
      const headers = {
        authorization: 'Bearer token123',
        'content-type': 'application/json',
        cookie: 'session=abc123',
      }
      const result = redactHeaders(headers)
      assert.equal(result['authorization'], MASKED_VALUE)
      assert.equal(result['cookie'], MASKED_VALUE)
      assert.equal(result['content-type'], 'application/json')
    })

    it('handles case-insensitive header name matching', async () => {
      const { redactHeaders, MASKED_VALUE } = await import('./redact')
      const headers = {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      }
      const result = redactHeaders(headers)
      assert.equal(result['Authorization'], MASKED_VALUE)
      assert.equal(result['Content-Type'], 'application/json')
    })
  })

  void describe('isSensitiveInputType', () => {
    it('recognizes sensitive input types', async () => {
      const { isSensitiveInputType } = await import('./redact')
      assert.ok(isSensitiveInputType('password'))
      assert.ok(isSensitiveInputType('credit-card-number'))
      assert.ok(isSensitiveInputType('cvv'))
    })

    it('rejects non-sensitive input types', async () => {
      const { isSensitiveInputType } = await import('./redact')
      assert.equal(isSensitiveInputType('text'), false)
      assert.equal(isSensitiveInputType('email'), false)
      assert.equal(isSensitiveInputType(''), false)
    })
  })

  void describe('Stats instrumentation', () => {
    it('instruments redactText with Stats.timeMean', async () => {
      const timeMeanMock = mock.method(
        Stats,
        'timeMean',
        (_label: string, fn: () => unknown) => fn()
      )
      const { redactText } = await import('./redact')
      redactText('hello')
      assert.equal(timeMeanMock.mock.callCount(), 1)
      const call = timeMeanMock.mock.calls[0]!
      assert.ok((call.arguments[0] as string).includes('Redaction~redactText'))
      mock.restoreAll()
    })
  })
})
