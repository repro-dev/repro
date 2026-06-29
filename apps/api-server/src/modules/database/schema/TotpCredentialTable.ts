import { GeneratedAlways } from 'kysely'

export interface TotpCredentialTable {
  id: GeneratedAlways<number>
  userId: number
  secret: string
  enabledAt: Date | null
  lastUsedAt: Date | null
  createdAt: GeneratedAlways<Date>
}
