import { GeneratedAlways } from 'kysely'

export interface AccountTable {
  id: GeneratedAlways<number>
  name: string
  active: boolean
  createdAt: GeneratedAlways<Date>
}
