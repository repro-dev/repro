import { GeneratedAlways } from 'kysely'

export interface PasswordResetTokenTable {
  id: GeneratedAlways<number>
  token: string
  userId: number
  expiresAt: Date
  usedAt: Date | null
}
