import { GeneratedAlways } from 'kysely'

export interface BillingEntitlementTable {
  id: GeneratedAlways<number>
  accountId: number
  feature: string
  enabled: number
  limit: number | null
  createdAt: GeneratedAlways<Date>
}
