import type {
  AgenticConversationContent,
  AgenticConversationRole,
  AgenticToolCall,
} from '@repro/domain'
import { Generated, GeneratedAlways } from 'kysely'

export interface AgenticConversationMessageTable {
  id: GeneratedAlways<number>
  conversationId: number
  sequence: number
  role: AgenticConversationRole
  content: AgenticConversationContent
  toolCalls: Array<AgenticToolCall> | null
  toolCallId: string | null
  createdAt: Generated<Date>
}
