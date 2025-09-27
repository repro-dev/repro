import { GeneratedAlways } from 'kysely'

export interface FeatureGateTable {
  id: GeneratedAlways<number>
  name: string
  description: string
  active: number
  createdAt: GeneratedAlways<Date>
}