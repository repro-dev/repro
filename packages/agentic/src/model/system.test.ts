import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  EXTENSION_SYSTEM_CARD_MESSAGE,
  SYSTEM_CARD_MESSAGE,
  WORKSPACE_SYSTEM_CARD_MESSAGE,
} from './system'

describe('system prompt — confidence instructions', () => {
  it('SHARED_SYSTEM_CARD instructs agent to assign confidence per hypothesis', () => {
    // All three exports extend SHARED_SYSTEM_CARD, so checking one is sufficient
    assert.ok(
      EXTENSION_SYSTEM_CARD_MESSAGE.includes('confidence'),
      "Expected the system card to mention 'confidence'"
    )
  })

  it('references low/medium/high confidence levels', () => {
    assert.ok(
      EXTENSION_SYSTEM_CARD_MESSAGE.includes('low'),
      "Expected 'low' confidence level in system card"
    )
    assert.ok(
      EXTENSION_SYSTEM_CARD_MESSAGE.includes('medium'),
      "Expected 'medium' confidence level in system card"
    )
    assert.ok(
      EXTENSION_SYSTEM_CARD_MESSAGE.includes('high'),
      "Expected 'high' confidence level in system card"
    )
  })

  it('mentions evidence-based confidence assignment in all system cards', () => {
    ;[EXTENSION_SYSTEM_CARD_MESSAGE, WORKSPACE_SYSTEM_CARD_MESSAGE].forEach(
      card => {
        assert.ok(
          card.includes('confidence'),
          `Expected card to mention confidence`
        )
      }
    )
  })

  it('SYSTEM_CARD_MESSAGE (backwards-compat) also includes confidence', () => {
    assert.ok(SYSTEM_CARD_MESSAGE.includes('confidence'))
  })
})
