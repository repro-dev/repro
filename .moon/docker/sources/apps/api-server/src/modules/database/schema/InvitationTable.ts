import { GeneratedAlways } from 'kysely'

export interface InvitationTable {
  id: GeneratedAlways<number>
  token: string
  email: string
  accountId: number
  active: number | null
}
