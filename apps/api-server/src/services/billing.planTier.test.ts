import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getPlanTierOrdinal, isUpgradePlan } from './billing'

describe('billing plan tier comparison', () => {
  describe('getPlanTierOrdinal', () => {
    it('returns 0 for Free plan', () => {
      assert.equal(getPlanTierOrdinal('Free'), 0)
    })

    it('returns 1 for Repro+ plan', () => {
      assert.equal(getPlanTierOrdinal('Repro+'), 1)
    })

    it('returns 2 for Repro++ plan', () => {
      assert.equal(getPlanTierOrdinal('Repro++'), 2)
    })

    it('returns -1 for unknown plan names', () => {
      assert.equal(getPlanTierOrdinal('Unknown'), -1)
    })
  })

  describe('isUpgradePlan', () => {
    it('returns true when moving from Free to Repro+', () => {
      assert.equal(isUpgradePlan('Free', 'Repro+'), true)
    })

    it('returns true when moving from Free to Repro++', () => {
      assert.equal(isUpgradePlan('Free', 'Repro++'), true)
    })

    it('returns true when moving from Repro+ to Repro++', () => {
      assert.equal(isUpgradePlan('Repro+', 'Repro++'), true)
    })

    it('returns false when moving from Repro+ to Free (downgrade)', () => {
      assert.equal(isUpgradePlan('Repro+', 'Free'), false)
    })

    it('returns false when moving from Repro++ to Repro+ (downgrade)', () => {
      assert.equal(isUpgradePlan('Repro++', 'Repro+'), false)
    })

    it('returns false when moving from Repro++ to Free (downgrade)', () => {
      assert.equal(isUpgradePlan('Repro++', 'Free'), false)
    })

    it('returns false when plan names are the same (lateral)', () => {
      assert.equal(isUpgradePlan('Repro+', 'Repro+'), false)
    })
  })
})
