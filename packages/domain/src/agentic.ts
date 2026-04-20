export type AgenticConversationRole = 'assistant' | 'system' | 'tool' | 'user'

// Agentic conversations use repo-standard numeric IDs for now.
// Keep this alias explicit so REP-757 / REP-758 can swap in a different
// public identifier contract without changing downstream call sites.
export type AgenticConversationId = number

export interface AgenticTextContentBlock {
  type: 'text'
  text: string
}

export interface AgenticImageUrlContentBlock {
  type: 'image_url'
  image_url: { url: string }
}

export type AgenticConversationContentBlock =
  | AgenticTextContentBlock
  | AgenticImageUrlContentBlock

export type AgenticConversationToolContent =
  | string
  | Array<AgenticConversationContentBlock>

export interface AgenticToolCall {
  id: string
  index: number
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface AgenticConversationMessageRecordBase {
  id: number
  conversationId: AgenticConversationId
  sequence: number
  createdAt: Date
}

export interface AgenticConversationSystemMessageRecord
  extends AgenticConversationMessageRecordBase {
  role: 'system'
  content: string
  toolCalls: null
  toolCallId: null
}

export interface AgenticConversationUserMessageRecord
  extends AgenticConversationMessageRecordBase {
  role: 'user'
  content: string
  toolCalls: null
  toolCallId: null
}

export interface AgenticConversationAssistantMessageRecord
  extends AgenticConversationMessageRecordBase {
  role: 'assistant'
  content: string
  toolCalls: Array<AgenticToolCall> | null
  toolCallId: null
}

export interface AgenticConversationToolMessageRecord
  extends AgenticConversationMessageRecordBase {
  role: 'tool'
  content: AgenticConversationToolContent
  toolCalls: null
  toolCallId: string
}

export type AgenticConversationMessageRecord =
  | AgenticConversationSystemMessageRecord
  | AgenticConversationUserMessageRecord
  | AgenticConversationAssistantMessageRecord
  | AgenticConversationToolMessageRecord

export interface AgenticConversationRecord {
  id: AgenticConversationId
  userId: number
  recordingId: string | null
  createdAt: Date
}
