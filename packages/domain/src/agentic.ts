export type AgenticConversationRole = 'assistant' | 'system' | 'tool' | 'user'

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

export type AgenticConversationContent =
  | string
  | Array<AgenticConversationContentBlock>

export interface AgenticToolCall {
  id: string
  index: number
  function: {
    name: string
    arguments: string
  }
}

export interface AgenticConversationRecord {
  id: number
  userId: number
  recordingId: string | null
  createdAt: Date
}

export interface AgenticConversationMessageRecord {
  id: number
  conversationId: number
  sequence: number
  role: AgenticConversationRole
  content: AgenticConversationContent
  toolCalls: Array<AgenticToolCall> | null
  toolCallId: string | null
  createdAt: Date
}
