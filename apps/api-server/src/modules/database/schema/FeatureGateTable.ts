import { GeneratedAlways } from 'kysely'

export interface FeatureGateTable {
  id: GeneratedAlways<number>
  name: string
  description: string
  enabled: number
  createdAt: GeneratedAlways<Date>
}