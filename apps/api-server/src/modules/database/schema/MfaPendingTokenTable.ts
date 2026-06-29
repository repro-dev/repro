import { GeneratedAlways } from 'kysely'

export interface MfaPendingTokenTable {
  id: GeneratedAlways<number>
  userId: number
  tokenHash: string
  createdAt: GeneratedAlways<Date>
}
