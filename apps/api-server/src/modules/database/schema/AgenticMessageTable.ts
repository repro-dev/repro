import { Generated, GeneratedAlways } from 'kysely'

export type AgenticMessageRole =
  | 'user'
  | 'assistant'
  | 'tool_call'
  | 'tool_result'

export interface AgenticMessageTable {
  id: GeneratedAlways<number>
  conversationId: number
  role: AgenticMessageRole
  // JSONB column — typed as unknown since Kysely 0.27 does not export a JsonValue helper
  content: unknown
  createdAt: Generated<Date>
}
