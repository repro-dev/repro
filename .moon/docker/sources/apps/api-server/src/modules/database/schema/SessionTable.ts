import { GeneratedAlways } from 'kysely'

export interface SessionTable {
  id: GeneratedAlways<number>
  sessionToken: string
  subjectId: number
  subjectType: 'user' | 'staff'
  createdAt: GeneratedAlways<Date>
}
