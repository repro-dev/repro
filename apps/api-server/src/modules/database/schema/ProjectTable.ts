import { Generated, GeneratedAlways } from 'kysely'

export interface ProjectTable {
  id: GeneratedAlways<number>
  accountId: number
  name: string
  active: Generated<boolean>
  createdAt: GeneratedAlways<Date>
}
