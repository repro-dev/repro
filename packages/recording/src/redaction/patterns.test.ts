import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PiiCategory } from './types'

void describe('redaction patterns', () => {
  void describe('sensitiveFieldPatterns', () => {
    it('matches known sensitive field names', async () => {
      const { sensitiveFieldPatterns } = await import('./patterns')
      for (const pattern of sensitiveFieldPatterns) {
        for (const field of pattern.fieldNames) {
          assert.ok(
            pattern.regex.test(field),
            `${pattern.regex} should match "${field}"`
          )
          assert.ok(
            pattern.regex.test(field.toUpperCase()),
            `${pattern.regex} should match "${field.toUpperCase()}"`
          )
        }
      }
    })
  })

  void describe('sensitiveValuePatterns', () => {
    it('matches email addresses', async () => {
      const { sensitiveValuePatterns } = await import('./patterns')
      const emailPattern = sensitiveValuePatterns.find(
        p => p.category === PiiCategory.Email
      )
      assert.ok(emailPattern, 'email pattern should exist')

      assert.ok(emailPattern.regex.test('user@example.com'))
      assert.ok(emailPattern.regex.test('test.user+tag@sub.domain.co.uk'))
      assert.equal(emailPattern.regex.test('notanemail'), false)
      assert.equal(emailPattern.regex.test('@domain'), false)
      assert.equal(emailPattern.regex.test('user@'), false)
    })

    it('matches credit card candidate digit sequences', async () => {
      const { sensitiveValuePatterns } = await import('./patterns')
      const ccPattern = sensitiveValuePatterns.find(
        p => p.category === PiiCategory.CreditCard
      )
      assert.ok(ccPattern, 'credit card pattern should exist')

      // Matches digit sequences of appropriate length
      assert.ok(ccPattern.regex.test('4111111111111111'))
      assert.ok(ccPattern.regex.test('5500000000000004'))
      // Too short
      assert.equal(ccPattern.regex.test('1234'), false)
      // All zeros (16 digits) — still a candidate, Luhn checked at detectPii level
      assert.ok(ccPattern.regex.test('0000000000000000'))
    })

    it('credit card validate function performs Luhn check', async () => {
      const { validateCreditCard } = await import('./patterns')
      // Valid Luhn
      assert.ok(validateCreditCard('4111111111111111'))
      assert.ok(validateCreditCard('5500000000000004'))
      // Fails Luhn (not a valid checksum)
      assert.equal(validateCreditCard('1234567890123456'), false)
      // Too short
      assert.equal(validateCreditCard('1234'), false)
    })

    it('matches IBAN numbers', async () => {
      const { sensitiveValuePatterns } = await import('./patterns')
      const ibanPattern = sensitiveValuePatterns.find(
        p => p.category === PiiCategory.IBAN
      )
      assert.ok(ibanPattern, 'IBAN pattern should exist')

      // Valid IBAN format (not validated by checksum)
      assert.ok(ibanPattern.regex.test('DE89370400440532013000'))
      assert.ok(ibanPattern.regex.test('GB29NWBK60161331926819'))
      // Too short
      assert.equal(ibanPattern.regex.test('DE89'), false)
    })

    it('matches SSN numbers', async () => {
      const { sensitiveValuePatterns } = await import('./patterns')
      const ssnPattern = sensitiveValuePatterns.find(
        p => p.category === PiiCategory.SSN
      )
      assert.ok(ssnPattern, 'SSN pattern should exist')

      assert.ok(ssnPattern.regex.test('123-45-6789'))
      assert.ok(ssnPattern.regex.test('123456789'))
      // Invalid area numbers
      assert.equal(ssnPattern.regex.test('000-45-6789'), false)
      assert.equal(ssnPattern.regex.test('666-45-6789'), false)
      assert.equal(ssnPattern.regex.test('900-45-6789'), false)
    })

    it('matches JWT tokens', async () => {
      const { sensitiveValuePatterns } = await import('./patterns')
      const tokenPattern = sensitiveValuePatterns.find(
        p => p.category === PiiCategory.AuthToken
      )
      assert.ok(tokenPattern, 'auth token pattern should exist')

      // Valid JWT
      assert.ok(
        tokenPattern.regex.test(
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3j6Z1D7GqE3WgYcYjVZ0mPJkQvG8I6N0'
        )
      )
      assert.equal(tokenPattern.regex.test('not-a-jwt-just-text'), false)
    })

    it('does not match empty strings', async () => {
      const { sensitiveValuePatterns } = await import('./patterns')
      for (const p of sensitiveValuePatterns) {
        assert.equal(p.regex.test(''), false)
      }
    })
  })

  void describe('PII_PATTERNS export', () => {
    it('associates patterns with PiiCategory correctly', async () => {
      const { PII_PATTERNS } = await import('./patterns')
      const categories = new Set(PII_PATTERNS.map(p => p.category))
      assert.ok(categories.has(PiiCategory.Email))
      assert.ok(categories.has(PiiCategory.CreditCard))
      assert.ok(categories.has(PiiCategory.IBAN))
      assert.ok(categories.has(PiiCategory.SSN))
      assert.ok(categories.has(PiiCategory.AuthToken))
    })
  })
})
