import { GeneratedAlways, Selectable } from 'kysely'
import { FeatureGate } from '~/types/featureGate'
import { withEncodedId } from '../helpers'

export interface FeatureGateTable {
  id: GeneratedAlways<number>
  name: string
  description: string
  enabled: boolean
  createdAt: GeneratedAlways<Date>
}

export function asFeatureGate(
  values: Selectable<FeatureGateTable>
): FeatureGate {
  return {
    ...withEncodedId(values),
  }
}
