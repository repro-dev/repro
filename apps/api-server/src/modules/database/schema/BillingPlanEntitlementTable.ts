import { GeneratedAlways } from 'kysely'

export interface BillingPlanEntitlementTable {
  id: GeneratedAlways<number>
  planId: number
  feature: string
  enabled: number
  limit: number | null
  createdAt: GeneratedAlways<Date>
}
