import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } from './config'

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

    it('unions Sets (does not replace)', () => {
      const overrides = {
        sensitiveHeaderNames: new Set(['x-custom-token']),
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      assert.ok(result.sensitiveHeaderNames.has('authorization'))
      assert.ok(result.sensitiveHeaderNames.has('x-custom-token'))
      assert.equal(
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('x-custom-token'),
        false
      )
    })

    it('concatenates arrays', () => {
      const overrides = {
        maskedSelectors: ['.custom-mask'],
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      assert.ok(result.maskedSelectors.includes('.custom-mask'))
    })

    it('partial overrides work with only one field set', () => {
      const overrides = {
        sensitiveInputTypes: new Set(['custom-type']),
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      assert.ok(result.sensitiveInputTypes.has('password'))
      assert.ok(result.sensitiveInputTypes.has('custom-type'))
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
  })
})
