import { GeneratedAlways } from 'kysely'

export interface AccountTable {
  id: GeneratedAlways<number>
  name: string
  active: number
  createdAt: GeneratedAlways<Date>
}
