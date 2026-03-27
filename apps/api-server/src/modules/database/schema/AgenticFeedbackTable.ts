import { Generated, GeneratedAlways } from 'kysely'

export interface AgenticFeedbackTable {
  id: GeneratedAlways<number>
  userId: number
  recordingId: string | null
  sentiment: 'positive' | 'negative'
  comment: string | null
  createdAt: Generated<Date>
}
