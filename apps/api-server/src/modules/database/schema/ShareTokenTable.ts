import { GeneratedAlways } from 'kysely'

export interface ShareTokenTable {
  id: GeneratedAlways<number>
  token: string
  resourceType: string
  resourceId: number
  createdBy: number
  createdAt: GeneratedAlways<Date>
  expiresAt: Date | null
  revokedAt: Date | null
}
