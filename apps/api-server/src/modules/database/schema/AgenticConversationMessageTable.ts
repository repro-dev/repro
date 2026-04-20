import type {
  AgenticConversationAssistantToolCall,
  AgenticConversationId,
  AgenticConversationMessageId,
  AgenticConversationToolContent,
} from '@repro/domain'
import { ColumnType, Generated, GeneratedAlways } from 'kysely'

// Kysely sees serialized JSON text at insert/update time, but selects parse back
// into structured objects from PostgreSQL's jsonb decoder.
type JsonbColumn<SelectType> = ColumnType<SelectType, string, string>

type JsonbNullableColumn<SelectType> = ColumnType<
  SelectType | null,
  string | null,
  string | null
>

interface AgenticConversationMessageTableBase {
  id: GeneratedAlways<AgenticConversationMessageId>
  conversationId: AgenticConversationId
  sequence: number
  createdAt: Generated<Date>
}

export interface AgenticConversationSystemMessageTable
  extends AgenticConversationMessageTableBase {
  role: 'system'
  content: JsonbColumn<string>
  toolCalls: null
  toolCallId: null
}

export interface AgenticConversationUserMessageTable
  extends AgenticConversationMessageTableBase {
  role: 'user'
  content: JsonbColumn<string>
  toolCalls: null
  toolCallId: null
}

export interface AgenticConversationAssistantMessageTable
  extends AgenticConversationMessageTableBase {
  role: 'assistant'
  content: JsonbColumn<string>
  toolCalls: JsonbNullableColumn<Array<AgenticConversationAssistantToolCall>>
  toolCallId: null
}

export interface AgenticConversationToolMessageTable
  extends AgenticConversationMessageTableBase {
  role: 'tool'
  content: JsonbColumn<AgenticConversationToolContent>
  toolCalls: null
  toolCallId: string
}

export type AgenticConversationMessageTable =
  | AgenticConversationSystemMessageTable
  | AgenticConversationUserMessageTable
  | AgenticConversationAssistantMessageTable
  | AgenticConversationToolMessageTable
