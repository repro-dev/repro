import { GeneratedAlways } from 'kysely'

export interface ProjectTable {
  id: GeneratedAlways<number>
  accountId: number
  name: string
  active: number | null
  createdAt: GeneratedAlways<Date>
}
