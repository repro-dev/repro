export interface EntitlementDefinition {
  feature: string
  enabled: boolean
  limit: number | null
}

export interface PlanDefinition {
  name: string
  providerProductId: string
  providerPriceId: string
  interval: 'month' | 'year'
  entitlements: Array<EntitlementDefinition>
}

export type PlanConfig = Array<PlanDefinition>

export function validatePlanConfig(config: PlanConfig): void {
  for (const plan of config) {
    if (plan.entitlements.length === 0) {
      throw new Error(
        `Plan "${plan.name}" (${plan.providerPriceId}) has zero entitlements`
      )
    }
  }

  const priceIds = config.map(p => p.providerPriceId)
  const seenPriceIds = new Set<string>()
  for (const priceId of priceIds) {
    if (seenPriceIds.has(priceId)) {
      throw new Error(`Duplicate providerPriceId: "${priceId}"`)
    }
    seenPriceIds.add(priceId)
  }

  const nameIntervals = config.map(p => `${p.name}::${p.interval}`)
  const seenNameIntervals = new Set<string>()
  for (const key of nameIntervals) {
    if (seenNameIntervals.has(key)) {
      throw new Error(`Duplicate name + interval combination: "${key}"`)
    }
    seenNameIntervals.add(key)
  }
}

export const sandboxPlanConfig: PlanConfig = [
  {
    name: 'Free',
    providerProductId: 'pro_sandbox_free',
    providerPriceId: 'pri_sandbox_free_month',
    interval: 'month',
    entitlements: [
      { feature: 'recordings', enabled: true, limit: 10 },
      { feature: 'seats', enabled: true, limit: 1 },
      { feature: 'ai_credits', enabled: false, limit: null },
    ],
  },
  {
    name: 'Repro+',
    providerProductId: 'pro_sandbox_plus',
    providerPriceId: 'pri_sandbox_plus_month',
    interval: 'month',
    entitlements: [
      { feature: 'recordings', enabled: true, limit: null },
      { feature: 'seats', enabled: true, limit: 5 },
      { feature: 'ai_credits', enabled: true, limit: 100 },
    ],
  },
  {
    name: 'Repro+',
    providerProductId: 'pro_sandbox_plus',
    providerPriceId: 'pri_sandbox_plus_year',
    interval: 'year',
    entitlements: [
      { feature: 'recordings', enabled: true, limit: null },
      { feature: 'seats', enabled: true, limit: 5 },
      { feature: 'ai_credits', enabled: true, limit: 100 },
    ],
  },
  {
    name: 'Repro++',
    providerProductId: 'pro_sandbox_plusplus',
    providerPriceId: 'pri_sandbox_plusplus_month',
    interval: 'month',
    entitlements: [
      { feature: 'recordings', enabled: true, limit: null },
      { feature: 'seats', enabled: true, limit: null },
      { feature: 'ai_credits', enabled: true, limit: 500 },
      { feature: 'priority_support', enabled: true, limit: null },
    ],
  },
  {
    name: 'Repro++',
    providerProductId: 'pro_sandbox_plusplus',
    providerPriceId: 'pri_sandbox_plusplus_year',
    interval: 'year',
    entitlements: [
      { feature: 'recordings', enabled: true, limit: null },
      { feature: 'seats', enabled: true, limit: null },
      { feature: 'ai_credits', enabled: true, limit: 500 },
      { feature: 'priority_support', enabled: true, limit: null },
    ],
  },
]
