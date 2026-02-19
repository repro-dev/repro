import { GeneratedAlways } from 'kysely'

export interface BillingPlanTable {
  id: GeneratedAlways<number>
  name: string
  providerPriceId: string
  providerProductId: string
  interval: 'month' | 'year'
  active: number
  createdAt: GeneratedAlways<Date>
}
