import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } from './config'
import { toRedactionOverrides } from './presets'
import { isSensitiveKey, setRedactionConfig } from './redact'

describe('redaction config', () => {
  describe('DEFAULT_REDACTION_CONFIG', () => {
    it('has all expected fields', () => {
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames instanceof Set)
      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveFieldPatterns instanceof Array
      )
      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveValuePatterns instanceof Array
      )
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveInputTypes instanceof Set)
      assert.ok(DEFAULT_REDACTION_CONFIG.maskedSelectors instanceof Array)

      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('authorization')
      )
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('cookie'))
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('set-cookie'))

      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveInputTypes.has('password'))
      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveInputTypes.has('credit-card-number')
      )
    })

    it('has at least one sensitive field pattern', () => {
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveFieldPatterns.length > 0)
    })

    it('has at least one sensitive value pattern', () => {
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveValuePatterns.length > 0)
    })
  })

  describe('mergeRedactionConfig', () => {
    it('returns default when no overrides given', () => {
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, {})
      assert.deepEqual(result, DEFAULT_REDACTION_CONFIG)
    })

    it('replaces Sets when override provided', () => {
      const overrides = {
        sensitiveHeaderNames: new Set(['x-custom-token']),
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      // REPLACEMENT semantics: only the override value is present
      assert.equal(result.sensitiveHeaderNames.has('authorization'), false)
      assert.ok(result.sensitiveHeaderNames.has('x-custom-token'))
      // Base must be unchanged
      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('authorization')
      )
    })

    it('replaces arrays when override provided', () => {
      const overrides = {
        maskedSelectors: ['.custom-mask'],
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      assert.ok(result.maskedSelectors.includes('.custom-mask'))
      // REPLACEMENT semantics: only the override value
      assert.equal(result.maskedSelectors.length, 1)
    })

    it('keeps base for absent override fields, replaces for present ones', () => {
      const overrides = {
        sensitiveInputTypes: new Set(['custom-type']),
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      // sensitiveInputTypes is replaced
      assert.equal(result.sensitiveInputTypes.has('password'), false)
      assert.ok(result.sensitiveInputTypes.has('custom-type'))
      // sensitiveHeaderNames is kept from base (absent override)
      assert.ok(result.sensitiveHeaderNames.has('authorization'))
    })

    it('empty overrides do not mutate defaults', () => {
      const originalHeaderCount =
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.size
      mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, {})
      assert.equal(
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.size,
        originalHeaderCount
      )
    })

    it('does not mutate the original config objects', () => {
      const originalFieldPatternsLength =
        DEFAULT_REDACTION_CONFIG.sensitiveFieldPatterns.length

      const overrides = {
        sensitiveFieldPatterns: [/custom-pattern/],
      }
      mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)

      assert.equal(
        DEFAULT_REDACTION_CONFIG.sensitiveFieldPatterns.length,
        originalFieldPatternsLength
      )
    })

    it('off preset redaction: auth header still sensitive, email not sensitive', () => {
      // Regression test for REP-1275 B1 — off preset must clear non-credential
      // PII while keeping the auth-header credential floor.
      const offOverride = toRedactionOverrides('off')
      setRedactionConfig(offOverride.redaction)

      // Auth header must still be detected as sensitive
      assert.ok(isSensitiveKey('authorization'))

      // Non-credential PII field must NOT be detected as sensitive
      assert.equal(isSensitiveKey('email'), false)

      // Reset to avoid test pollution
      setRedactionConfig(undefined)
    })
  })
})
