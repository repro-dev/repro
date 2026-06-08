import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

void describe('redaction config', () => {
  void describe('DEFAULT_REDACTION_CONFIG', () => {
    it('has all expected fields', async () => {
      const { DEFAULT_REDACTION_CONFIG } = await import('./config')
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames instanceof Set)
      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveFieldPatterns instanceof Array
      )
      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveValuePatterns instanceof Array
      )
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveInputTypes instanceof Set)
      assert.ok(DEFAULT_REDACTION_CONFIG.maskedSelectors instanceof Array)

      // Sensitive header names
      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('authorization')
      )
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('cookie'))
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('set-cookie'))

      // Sensitive input types
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveInputTypes.has('password'))
      assert.ok(
        DEFAULT_REDACTION_CONFIG.sensitiveInputTypes.has('credit-card-number')
      )
    })

    it('has at least one sensitive field pattern', async () => {
      const { DEFAULT_REDACTION_CONFIG } = await import('./config')
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveFieldPatterns.length > 0)
    })

    it('has at least one sensitive value pattern', async () => {
      const { DEFAULT_REDACTION_CONFIG } = await import('./config')
      assert.ok(DEFAULT_REDACTION_CONFIG.sensitiveValuePatterns.length > 0)
    })
  })

  void describe('mergeRedactionConfig', () => {
    it('returns default when no overrides given', async () => {
      const { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } = await import(
        './config'
      )
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, {})
      assert.deepEqual(result, DEFAULT_REDACTION_CONFIG)
    })

    it('unions Sets (does not replace)', async () => {
      const { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } = await import(
        './config'
      )
      const overrides = {
        sensitiveHeaderNames: new Set(['x-custom-token']),
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      assert.ok(result.sensitiveHeaderNames.has('authorization'))
      assert.ok(result.sensitiveHeaderNames.has('x-custom-token'))
      // Default set is not mutated
      assert.equal(
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.has('x-custom-token'),
        false
      )
    })

    it('concatenates arrays', async () => {
      const { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } = await import(
        './config'
      )
      const overrides = {
        maskedSelectors: ['.custom-mask'],
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      assert.ok(result.maskedSelectors.includes('.custom-mask'))
    })

    it('partial overrides work with only one field set', async () => {
      const { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } = await import(
        './config'
      )
      const overrides = {
        sensitiveInputTypes: new Set(['custom-type']),
      }
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
      assert.ok(result.sensitiveInputTypes.has('password'))
      assert.ok(result.sensitiveInputTypes.has('custom-type'))
    })

    it('empty overrides do not mutate defaults', async () => {
      const { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } = await import(
        './config'
      )
      const originalHeaderCount =
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.size
      const result = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, {})
      assert.equal(
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames.size,
        originalHeaderCount
      )
      assert.deepEqual(
        result.sensitiveHeaderNames,
        DEFAULT_REDACTION_CONFIG.sensitiveHeaderNames
      )
    })

    it('does not mutate the original config objects', async () => {
      const { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } = await import(
        './config'
      )
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
