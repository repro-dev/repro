import type { AgenticConversationId } from '@repro/domain'
import { Generated, GeneratedAlways } from 'kysely'

export interface AgenticConversationTable {
  id: GeneratedAlways<AgenticConversationId>
  userId: number
  recordingId: string | null
  createdAt: Generated<Date>
}
