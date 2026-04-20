import { Generated, GeneratedAlways } from 'kysely'

export interface AgenticConversationTable {
  id: GeneratedAlways<number>
  userId: number
  recordingId: string | null
  createdAt: Generated<Date>
}
