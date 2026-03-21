import { Generated, GeneratedAlways } from 'kysely'

export interface OAuthAuthorizationCodeTable {
  id: GeneratedAlways<number>
  code: string
  clientId: string
  userId: number
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: Generated<string>
  scopes: string[]
  expiresAt: Date
  used: Generated<boolean>
  createdAt: GeneratedAlways<Date>
}
