import { fontFamily } from '@repro/design'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyResetStyles } from './index'

describe('applyResetStyles', () => {
  it('inserts the shared product sans stack into the root reset', () => {
    const insertedRules: string[] = []
    const styleTarget = {
      sheet: {
        cssRules: [],
        insertRule(rule: string) {
          insertedRules.push(rule)
        },
      },
    } as unknown as HTMLStyleElement

    applyResetStyles('#admin-root', styleTarget)

    const resetRules = insertedRules.join('\n')

    assert.ok(resetRules.includes(`font-family: ${fontFamily.sans};`))
    assert.doesNotMatch(resetRules, /font-family: sans-serif;/)
  })
})
