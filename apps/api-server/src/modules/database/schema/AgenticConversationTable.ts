import { GeneratedAlways } from 'kysely'

export interface AgenticConversationTable {
  id: GeneratedAlways<number>
  recordingId: number
  userId: number
  createdAt: GeneratedAlways<Date>
  updatedAt: GeneratedAlways<Date>
}
