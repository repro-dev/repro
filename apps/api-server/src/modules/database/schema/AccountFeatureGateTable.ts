import { GeneratedAlways } from 'kysely'

export interface AccountFeatureGateTable {
  id: GeneratedAlways<number>
  accountId: number
  featureGateId: number
  enabled: number
  grantedAt: GeneratedAlways<Date>
  grantedBy: number | null
}
