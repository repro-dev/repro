import { GeneratedAlways } from 'kysely'

export interface ApiKeyTable {
  id: GeneratedAlways<number>
  token: string
  name: string
  userId: number
  scopes: string[]
  lastUsedAt: Date | null
  createdAt: GeneratedAlways<Date>
  revokedAt: Date | null
}
