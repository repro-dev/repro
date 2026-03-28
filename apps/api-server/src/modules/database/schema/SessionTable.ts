import { GeneratedAlways } from 'kysely'

export interface SessionTable {
  id: GeneratedAlways<number>
  sessionTokenHash: string
  subjectId: number
  subjectType: 'user' | 'staff'
  createdAt: GeneratedAlways<Date>
}
