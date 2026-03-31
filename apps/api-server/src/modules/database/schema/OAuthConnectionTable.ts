import { GeneratedAlways } from 'kysely'

export type OAuthProvider = 'google'

export interface OAuthConnectionTable {
  id: GeneratedAlways<number>
  userId: number
  provider: OAuthProvider
  providerAccountId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  createdAt: GeneratedAlways<Date>
}
