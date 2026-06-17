import { Stats } from '@repro/diagnostics'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  MASKED_VALUE,
  detectPii,
  isSensitiveInputType,
  isSensitiveKey,
  redactHeaders,
  redactText,
  redactUrl,
  redactValue,
} from './redact'

describe('redact functions', () => {
  describe('redactText', () => {
    it('preserves whitespace and replaces non-whitespace', () => {
      assert.equal(redactText('hello'), '*****')
      assert.equal(redactText('hello world'), '***** *****')
      assert.equal(redactText('  '), '  ')
      assert.equal(redactText('a b'), '* *')
    })

    it('handles empty string', () => {
      assert.equal(redactText(''), '')
    })

    it('handles unicode', () => {
      assert.equal(redactText('héllo'), '*****')
      assert.equal(redactText('中文'), '**')
    })

    it('preserves newlines and tabs', () => {
      const result = redactText('hello\nworld\t!')
      assert.equal(result, '*****\n*****\t*')
    })
  })

  describe('isSensitiveKey', () => {
    it('detects known sensitive key patterns', () => {
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

    it('rejects benign keys', () => {
      assert.equal(isSensitiveKey('username'), false)
      assert.equal(isSensitiveKey('name'), false)
      assert.equal(isSensitiveKey('id'), false)
      assert.equal(isSensitiveKey('type'), false)
      assert.equal(isSensitiveKey(''), false)
    })
  })

  describe('detectPii', () => {
    it('detects email addresses', () => {
      const result = detectPii('user@example.com')
      assert.ok(result.detected)
      assert.equal(result.category, 'Email')
    })

    it('detects credit card numbers (with Luhn)', () => {
      const result = detectPii('4111111111111111')
      assert.ok(result.detected)
      assert.equal(result.category, 'CreditCard')
      assert.equal(detectPii('1234567890123456').detected, false)
    })

    it('detects IBANs', () => {
      const result = detectPii('DE89370400440532013000')
      assert.ok(result.detected)
      assert.equal(result.category, 'IBAN')
    })

    it('detects SSNs', () => {
      const result = detectPii('123-45-6789')
      assert.ok(result.detected)
      assert.equal(result.category, 'SSN')
    })

    it('detects JWT tokens', () => {
      const result = detectPii(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3j6Z1D7GqE3WgYcYjVZ0mPJkQvG8I6N0'
      )
      assert.ok(result.detected)
      assert.equal(result.category, 'AuthToken')
    })

    it('returns detected: false for clean strings', () => {
      assert.equal(detectPii('hello world').detected, false)
      assert.equal(detectPii('just some regular text').detected, false)
      assert.equal(detectPii('').detected, false)
    })
  })

  describe('redactValue', () => {
    it('redacts strings with sensitive content', () => {
      const result = redactValue('user@example.com')
      assert.equal(result, MASKED_VALUE)
    })

    it('passes through non-sensitive strings', () => {
      assert.equal(redactValue('hello'), 'hello')
    })

    it('deep-redacts nested objects', () => {
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

    it('handles arrays', () => {
      const arr = ['hello', 'john@example.com']
      const result = redactValue(arr) as Array<unknown>
      assert.equal(result[0], 'hello')
      assert.equal(result[1], MASKED_VALUE)
    })

    it('handles circular references', () => {
      const obj: Record<string, unknown> = { name: 'test' }
      obj.self = obj
      const result = redactValue(obj) as Record<string, unknown>
      assert.equal(result.name, 'test')
      assert.equal(result.self, MASKED_VALUE)
    })

    it('handles primitives', () => {
      assert.equal(redactValue(42), 42)
      assert.equal(redactValue(null), null)
      assert.equal(redactValue(undefined), undefined)
      assert.equal(redactValue(true), true)
    })
  })

  describe('redactHeaders', () => {
    it('masks known sensitive header names', () => {
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

    it('handles case-insensitive header name matching', () => {
      const headers = {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      }
      const result = redactHeaders(headers)
      assert.equal(result['Authorization'], MASKED_VALUE)
      assert.equal(result['Content-Type'], 'application/json')
    })
  })

  describe('isSensitiveInputType', () => {
    it('recognizes sensitive input types', () => {
      assert.ok(isSensitiveInputType('password'))
      assert.ok(isSensitiveInputType('credit-card-number'))
      assert.ok(isSensitiveInputType('cvv'))
    })

    it('rejects non-sensitive input types', () => {
      assert.equal(isSensitiveInputType('text'), false)
      assert.equal(isSensitiveInputType('email'), false)
      assert.equal(isSensitiveInputType(''), false)
    })
  })

  describe('redactUrl', () => {
    it('redacts sensitive query params and preserves non-sensitive ones', () => {
      const result = redactUrl('https://example.com/api?token=abc123&name=test')
      assert.equal(result, 'https://example.com/api?token=[MASKED]&name=test')
    })

    it('redacts all sensitive param patterns', () => {
      const url =
        'https://example.com?' +
        'password=secret&' +
        'token=jwt123&' +
        'secret=hidden&' +
        'api-key=key123&' +
        'access-token=at123&' +
        'refresh-token=rt123&' +
        'cookie=abc123&' +
        'authorization=Bearer+x&' +
        'credit_card=4111111111111111&' +
        'ssn=123-45-6789&' +
        'iban=DE89370400440532013000&' +
        'phone=%2B1234567890&' +
        'email=test%40example.com'
      const result = redactUrl(url)
      const params = new URL(result).searchParams
      for (const [key, value] of params) {
        assert.equal(value, '[MASKED]', `expected param "${key}" to be masked`)
      }
    })

    it('preserves non-sensitive params unchanged', () => {
      const result = redactUrl('https://example.com/api?page=1&sort=asc')
      assert.equal(result, 'https://example.com/api?page=1&sort=asc')
    })

    it('preserves URL structure including hash', () => {
      const result = redactUrl(
        'https://example.com/path/to/page?token=abc&name=test#section'
      )
      assert.ok(result.startsWith('https://example.com/path/to/page?'))
      assert.ok(result.endsWith('#section'))
      assert.ok(result.includes('token=[MASKED]'))
      assert.ok(result.includes('name=test'))
    })

    it('handles URLs without query strings', () => {
      const result = redactUrl('https://example.com/page')
      assert.equal(result, 'https://example.com/page')
    })

    it('handles malformed URLs by returning the original string', () => {
      const malformed = 'not a url at all'
      assert.equal(redactUrl(malformed), malformed)
    })

    it('handles empty string', () => {
      assert.equal(redactUrl(''), '')
    })

    it('handles WebSocket URLs', () => {
      const result = redactUrl('ws://example.com/ws?token=xyz&room=general')
      assert.equal(result, 'ws://example.com/ws?token=[MASKED]&room=general')
    })

    it('handles secure WebSocket URLs', () => {
      const result = redactUrl('wss://example.com/ws?secret=top&id=1')
      assert.equal(result, 'wss://example.com/ws?secret=[MASKED]&id=1')
    })

    it('handles URLs with no sensitive params but with query string', () => {
      const result = redactUrl('https://example.com/?q=search&page=2')
      assert.equal(result, 'https://example.com/?q=search&page=2')
    })

    it('handles URL with only sensitive params', () => {
      const result = redactUrl('https://example.com/auth?token=abc')
      assert.equal(result, 'https://example.com/auth?token=[MASKED]')
    })
  })

  describe('Stats instrumentation', () => {
    it('instruments redactText with Stats.timeMean', () => {
      const timeMeanMock = mock.method(
        Stats,
        'timeMean',
        (_label: string, fn: () => unknown) => fn()
      )
      redactText('hello')
      assert.equal(timeMeanMock.mock.callCount(), 1)
      const call = timeMeanMock.mock.calls[0]!
      assert.ok((call.arguments[0] as string).includes('Redaction~redactText'))
      mock.restoreAll()
    })
  })
})
