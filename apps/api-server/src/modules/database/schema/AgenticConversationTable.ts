import { Generated, GeneratedAlways } from 'kysely'

export interface AgenticConversationTable {
  id: GeneratedAlways<number>
  recordingId: number
  userId: number
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}
