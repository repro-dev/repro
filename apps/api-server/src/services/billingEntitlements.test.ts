import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { BillingService } from './billing'

describe('Services > Billing Entitlements', () => {
  let harness: Harness
  let billingService: BillingService

  before(async () => {
    harness = await createTestHarness()
    billingService = harness.services.billingService
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('getEntitlements', () => {
    it('should return entitlements for an active subscription', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_ProPlan_Checkout,
      ])

      const entitlements = await promise(
        billingService.getEntitlements(account.id)
      )

      expect(entitlements).toHaveLength(3)
      expect(entitlements).toEqual(
        expect.arrayContaining([
          { feature: 'recordings', enabled: true, limit: null },
          { feature: 'seats', enabled: true, limit: 5 },
          { feature: 'ai_credits', enabled: true, limit: 100 },
        ])
      )
    })

    it('should return limited entitlements for free plan', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_FreePlan_Checkout,
      ])

      const entitlements = await promise(
        billingService.getEntitlements(account.id)
      )

      expect(entitlements).toEqual(
        expect.arrayContaining([
          { feature: 'recordings', enabled: true, limit: 10 },
          { feature: 'seats', enabled: true, limit: 1 },
        ])
      )
    })

    it('should retain entitlements for a past_due subscription', async () => {
      const [, account] = await harness.loadFixtures([
        fixtures.billing.AccountA_ProPlan_PastDueSubscription,
        fixtures.account.AccountA,
      ])

      const entitlements = await promise(
        billingService.getEntitlements(account.id)
      )

      expect(entitlements).toHaveLength(3)
      expect(entitlements).toEqual(
        expect.arrayContaining([
          { feature: 'recordings', enabled: true, limit: null },
          { feature: 'seats', enabled: true, limit: 5 },
          { feature: 'ai_credits', enabled: true, limit: 100 },
        ])
      )
    })

    it('should return empty entitlements for a canceled subscription', async () => {
      const [, account] = await harness.loadFixtures([
        fixtures.billing.AccountA_ProPlan_CanceledSubscription,
        fixtures.account.AccountA,
      ])

      const entitlements = await promise(
        billingService.getEntitlements(account.id)
      )

      expect(entitlements).toEqual([])
    })

    it('should return entitlements from cache on second call', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_ProPlan_Checkout,
      ])

      const first = await promise(billingService.getEntitlements(account.id))
      const second = await promise(billingService.getEntitlements(account.id))

      expect(first).toEqual(second)
    })

    it('should automatically return fresh entitlements after changePlan', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.billing.AccountA_FreePlan_Checkout,
      ])

      const before = await promise(billingService.getEntitlements(account.id))
      expect(before).toEqual(
        expect.arrayContaining([
          { feature: 'recordings', enabled: true, limit: 10 },
        ])
      )

      const [proPlan] = await harness.loadFixtures([
        fixtures.billing.ProPlan,
      ])
      await promise(billingService.changePlan(account.id, proPlan.id))

      const after = await promise(billingService.getEntitlements(account.id))
      expect(after).toEqual(
        expect.arrayContaining([
          { feature: 'recordings', enabled: true, limit: null },
        ])
      )
    })

    it('should return empty entitlements when no subscription exists', async () => {
      const [account] = await harness.loadFixtures([
        fixtures.account.AccountA,
      ])

      const entitlements = await promise(
        billingService.getEntitlements(account.id)
      )

      expect(entitlements).toEqual([])
    })
  })
})
