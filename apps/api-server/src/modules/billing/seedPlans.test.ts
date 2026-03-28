import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Database } from '~/modules/database/types'
import { setUpTestDatabase } from '~/testing/database'
import { PlanConfig, sandboxPlanConfig } from './planConfig'
import { seedPlans } from './seedPlans'

describe('seedPlans', () => {
  let db: Database
  let close: () => Promise<void>

  before(async () => {
    const harness = await setUpTestDatabase()
    db = harness.db
    close = harness.close
  })

  beforeEach(async () => {
    await db.deleteFrom('billing_plan_entitlements').execute()
    await db.deleteFrom('billing_plans').execute()
  })

  after(async () => {
    await close()
  })

  it('inserts all plans from config', async () => {
    await seedPlans(db, sandboxPlanConfig)

    const plans = await db.selectFrom('billing_plans').selectAll().execute()

    assert.equal(plans.length, sandboxPlanConfig.length)

    const priceIds = plans.map(p => p.providerPriceId)
    for (const plan of sandboxPlanConfig) {
      assert.ok(
        priceIds.includes(plan.providerPriceId),
        `Expected plan ${plan.providerPriceId} to be inserted`
      )
    }
  })

  it('inserts all entitlements for each plan', async () => {
    await seedPlans(db, sandboxPlanConfig)

    const entitlements = await db
      .selectFrom('billing_plan_entitlements')
      .selectAll()
      .execute()

    const totalExpected = sandboxPlanConfig.reduce(
      (sum, plan) => sum + plan.entitlements.length,
      0
    )

    assert.equal(entitlements.length, totalExpected)
  })

  it('is idempotent (re-run produces same result)', async () => {
    await seedPlans(db, sandboxPlanConfig)
    await seedPlans(db, sandboxPlanConfig)

    const plans = await db.selectFrom('billing_plans').selectAll().execute()

    const entitlements = await db
      .selectFrom('billing_plan_entitlements')
      .selectAll()
      .execute()

    assert.equal(plans.length, sandboxPlanConfig.length)

    const totalExpected = sandboxPlanConfig.reduce(
      (sum, plan) => sum + plan.entitlements.length,
      0
    )
    assert.equal(entitlements.length, totalExpected)
  })

  it('deactivates plans not in config', async () => {
    await seedPlans(db, sandboxPlanConfig)

    const reducedConfig: PlanConfig = [sandboxPlanConfig[0]!]
    await seedPlans(db, reducedConfig)

    const inactivePlans = await db
      .selectFrom('billing_plans')
      .selectAll()
      .where('active', '=', false)
      .execute()

    assert.equal(inactivePlans.length, sandboxPlanConfig.length - 1)
  })

  it('throws when config has a plan with zero entitlements', async () => {
    const badConfig: PlanConfig = [
      {
        name: 'Empty',
        providerProductId: 'pro_empty',
        providerPriceId: 'pri_empty_month',
        interval: 'month',
        entitlements: [],
      },
    ]

    await assert.rejects(() => seedPlans(db, badConfig), /zero entitlements/i)
  })
})
