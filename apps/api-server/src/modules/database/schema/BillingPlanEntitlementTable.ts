import { GeneratedAlways } from 'kysely'

export interface BillingPlanEntitlementTable {
  id: GeneratedAlways<number>
  planId: number
  feature: string
  enabled: boolean
  limit: number | null
  createdAt: GeneratedAlways<Date>
}
