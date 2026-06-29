import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toRedactionOverrides } from './presets'

describe('toRedactionOverrides', () => {
  it('returns a fresh object on each call', () => {
    const a = toRedactionOverrides('standard')
    const b = toRedactionOverrides('standard')
    assert.notStrictEqual(a, b)
    assert.notStrictEqual(a.maskedSelectors, b.maskedSelectors)
  })

  it('strict preset masks input elements, textareas, selects, contenteditable, img, and .repro-mask', () => {
    const result = toRedactionOverrides('strict')
    assert.deepStrictEqual(result.maskedSelectors, [
      '.repro-mask',
      'input',
      'textarea',
      'select',
      '[contenteditable]',
      'img',
    ])
    assert.strictEqual(result.redaction, undefined)
    assert.strictEqual(result.maskImages, true)
  })

  it('standard preset masks only .repro-mask selectors', () => {
    const result = toRedactionOverrides('standard')
    assert.deepStrictEqual(result.maskedSelectors, ['.repro-mask'])
    assert.strictEqual(result.redaction, undefined)
    assert.strictEqual(result.maskImages, false)
  })

  it('off preset clears all PII fields while keeping sensitiveHeaderNames credential floor', () => {
    const result = toRedactionOverrides('off')

    assert.deepStrictEqual(result.maskedSelectors, [])

    // Keeps the credential floor: sensitiveHeaderNames should stay intact
    assert.ok(result.redaction)
    assert.strictEqual(result.redaction.sensitiveHeaderNames, undefined)

    // Clears non-credential PII fields
    assert.deepStrictEqual(result.redaction!.sensitiveFieldPatterns, [])
    assert.deepStrictEqual(result.redaction!.sensitiveValuePatterns, [])
    assert.ok(result.redaction!.sensitiveInputTypes instanceof Set)
    assert.strictEqual(result.redaction!.sensitiveInputTypes.size, 0)

    assert.strictEqual(result.maskImages, false)
  })

  it('returns standard on unknown preset value', () => {
    const result = toRedactionOverrides('non-existent' as any)
    assert.deepStrictEqual(result.maskedSelectors, ['.repro-mask'])
    assert.strictEqual(result.maskImages, false)
  })
})
