import { GeneratedAlways } from 'kysely'

export interface UserFeatureGateTable {
  id: GeneratedAlways<number>
  userId: number
  featureGateId: number
  enabled: number
  grantedAt: GeneratedAlways<Date>
  grantedBy: number | null
}