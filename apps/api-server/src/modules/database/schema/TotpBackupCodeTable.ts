import { GeneratedAlways } from 'kysely'

export interface TotpBackupCodeTable {
  id: GeneratedAlways<number>
  userId: number
  codeHash: string
  usedAt: Date | null
  createdAt: GeneratedAlways<Date>
}
