import { Database } from '~/modules/database/types'
import { PlanConfig, validatePlanConfig } from './planConfig'

export async function seedPlans(
  db: Database,
  config: PlanConfig
): Promise<void> {
  validatePlanConfig(config)

  for (const plan of config) {
    const inserted = await db
      .insertInto('billing_plans')
      .values({
        name: plan.name,
        providerPriceId: plan.providerPriceId,
        providerProductId: plan.providerProductId,
        interval: plan.interval,
        active: true,
      })
      .onConflict(oc =>
        oc.column('providerPriceId').doUpdateSet({
          name: plan.name,
          providerProductId: plan.providerProductId,
          interval: plan.interval,
          active: true,
        })
      )
      .returning(['id'])
      .executeTakeFirstOrThrow()

    for (const entitlement of plan.entitlements) {
      await db
        .insertInto('billing_plan_entitlements')
        .values({
          planId: inserted.id,
          feature: entitlement.feature,
          enabled: entitlement.enabled,
          limit: entitlement.limit,
        })
        .onConflict(oc =>
          oc.columns(['planId', 'feature']).doUpdateSet({
            enabled: entitlement.enabled,
            limit: entitlement.limit,
          })
        )
        .execute()
    }
  }

  const activePriceIds = config.map(p => p.providerPriceId)

  await db
    .updateTable('billing_plans')
    .set({ active: false })
    .where('providerPriceId', 'not in', activePriceIds)
    .execute()
}
