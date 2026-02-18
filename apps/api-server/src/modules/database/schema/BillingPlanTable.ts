import { GeneratedAlways } from 'kysely'

export interface BillingPlanTable {
  id: GeneratedAlways<number>
  name: string
  providerPriceId: string
  providerProductId: string
  tier: 'free' | 'pro' | 'team' | 'enterprise'
  interval: 'month' | 'year'
  active: number
  createdAt: GeneratedAlways<Date>
}
