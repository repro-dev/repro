import { GeneratedAlways } from 'kysely'

export interface OAuthClientTable {
  id: GeneratedAlways<number>
  clientId: string
  clientSecret: string | null
  name: string
  redirectUris: string[]
  userId: number
  createdAt: GeneratedAlways<Date>
}
