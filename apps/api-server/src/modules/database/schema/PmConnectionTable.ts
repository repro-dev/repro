import { Generated, GeneratedAlways } from 'kysely'

export type PmProvider = 'linear'

export interface PmConnectionTable {
  id: GeneratedAlways<number>
  accountId: number
  provider: PmProvider
  providerWorkspaceId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  scopes: string[]
  status: string
  createdAt: GeneratedAlways<Date>
  updatedAt: Generated<Date>
}
