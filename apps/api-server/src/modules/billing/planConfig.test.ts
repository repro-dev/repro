import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PlanConfig, sandboxPlanConfig, validatePlanConfig } from './planConfig'

describe('planConfig', () => {
  describe('validatePlanConfig', () => {
    it('accepts the sandbox config without throwing', () => {
      assert.doesNotThrow(() => validatePlanConfig(sandboxPlanConfig))
    })

    it('throws when a plan has zero entitlements', () => {
      const config: PlanConfig = [
        {
          name: 'Empty',
          providerProductId: 'pro_empty',
          providerPriceId: 'pri_empty_month',
          interval: 'month',
          entitlements: [],
        },
      ]

      assert.throws(() => validatePlanConfig(config), /zero entitlements/i)
    })

    it('throws when providerPriceId is duplicated', () => {
      const config: PlanConfig = [
        {
          name: 'PlanA',
          providerProductId: 'pro_a',
          providerPriceId: 'pri_duplicate',
          interval: 'month',
          entitlements: [{ feature: 'recordings', enabled: true, limit: null }],
        },
        {
          name: 'PlanB',
          providerProductId: 'pro_b',
          providerPriceId: 'pri_duplicate',
          interval: 'year',
          entitlements: [{ feature: 'recordings', enabled: true, limit: null }],
        },
      ]

      assert.throws(
        () => validatePlanConfig(config),
        /duplicate providerPriceId/i
      )
    })

    it('throws when name + interval combination is duplicated', () => {
      const config: PlanConfig = [
        {
          name: 'MyPlan',
          providerProductId: 'pro_a',
          providerPriceId: 'pri_a_month',
          interval: 'month',
          entitlements: [{ feature: 'recordings', enabled: true, limit: null }],
        },
        {
          name: 'MyPlan',
          providerProductId: 'pro_b',
          providerPriceId: 'pri_b_month',
          interval: 'month',
          entitlements: [{ feature: 'recordings', enabled: true, limit: null }],
        },
      ]

      assert.throws(
        () => validatePlanConfig(config),
        /duplicate name \+ interval/i
      )
    })
  })

  describe('sandboxPlanConfig', () => {
    it('has 5 plans', () => {
      assert.equal(sandboxPlanConfig.length, 5)
    })

    it('every plan has at least one entitlement', () => {
      for (const plan of sandboxPlanConfig) {
        assert.ok(
          plan.entitlements.length > 0,
          `Plan "${plan.name}" (${plan.providerPriceId}) has no entitlements`
        )
      }
    })

    it('Free plan has limited recordings (10) and 1 seat', () => {
      const freePlan = sandboxPlanConfig.find(
        p => p.name === 'Free' && p.interval === 'month'
      )
      assert.ok(freePlan, 'Free plan not found')

      const recordings = freePlan.entitlements.find(
        e => e.feature === 'recordings'
      )
      assert.ok(recordings, 'recordings entitlement not found')
      assert.equal(recordings.limit, 10)
      assert.equal(recordings.enabled, true)

      const seats = freePlan.entitlements.find(e => e.feature === 'seats')
      assert.ok(seats, 'seats entitlement not found')
      assert.equal(seats.limit, 1)
    })

    it('Repro++ plans include priority_support', () => {
      const plusplusPlans = sandboxPlanConfig.filter(p => p.name === 'Repro++')
      assert.ok(plusplusPlans.length > 0, 'No Repro++ plans found')

      for (const plan of plusplusPlans) {
        const prioritySupport = plan.entitlements.find(
          e => e.feature === 'priority_support'
        )
        assert.ok(
          prioritySupport,
          `Repro++ plan (${plan.providerPriceId}) missing priority_support`
        )
        assert.equal(prioritySupport.enabled, true)
      }
    })
  })
})
