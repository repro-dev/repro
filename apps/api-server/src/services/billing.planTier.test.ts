import expect from 'expect'
import { describe, it } from 'node:test'
import { getPlanTierOrdinal, isUpgradePlan } from './billing'

describe('billing plan tier comparison', () => {
  describe('getPlanTierOrdinal', () => {
    it('returns 0 for Free plan', () => {
      expect(getPlanTierOrdinal('Free')).toBe(0)
    })

    it('returns 1 for Repro+ plan', () => {
      expect(getPlanTierOrdinal('Repro+')).toBe(1)
    })

    it('returns 2 for Repro++ plan', () => {
      expect(getPlanTierOrdinal('Repro++')).toBe(2)
    })

    it('throws a BadRequestError for unknown plan names', () => {
      expect(() => getPlanTierOrdinal('Unknown')).toThrow(
        'Unknown plan name: "Unknown"'
      )
      try {
        getPlanTierOrdinal('Unknown')
      } catch (err) {
        expect((err as Error).name).toBe('BadRequestError')
      }
    })
  })

  describe('isUpgradePlan', () => {
    it('returns true when moving from Free to Repro+', () => {
      expect(isUpgradePlan('Free', 'Repro+')).toBe(true)
    })

    it('returns true when moving from Free to Repro++', () => {
      expect(isUpgradePlan('Free', 'Repro++')).toBe(true)
    })

    it('returns true when moving from Repro+ to Repro++', () => {
      expect(isUpgradePlan('Repro+', 'Repro++')).toBe(true)
    })

    it('returns false when moving from Repro+ to Free (downgrade)', () => {
      expect(isUpgradePlan('Repro+', 'Free')).toBe(false)
    })

    it('returns false when moving from Repro++ to Repro+ (downgrade)', () => {
      expect(isUpgradePlan('Repro++', 'Repro+')).toBe(false)
    })

    it('returns false when moving from Repro++ to Free (downgrade)', () => {
      expect(isUpgradePlan('Repro++', 'Free')).toBe(false)
    })

    it('returns false when plan names are the same (lateral)', () => {
      expect(isUpgradePlan('Repro+', 'Repro+')).toBe(false)
    })
  })
})
