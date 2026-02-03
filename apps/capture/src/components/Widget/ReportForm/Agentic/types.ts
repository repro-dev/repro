import { Atom } from '@repro/atom'

export interface UserMessage {
  id: string
  timestamp: Date
  role: 'user'
  content: string
}

export type UserMessageContext = Pick<UserMessage, 'role' | 'content'>

export interface ToolCall {
  id: string
  index: number
  function: {
    name: string
    arguments: string
  }
}

export interface AssistantMessage {
  id: string
  timestamp: Date
  role: 'assistant'
  content: string
  toolCalls: Array<ToolCall>
}

export type AssistantMessageContext = Pick<AssistantMessage, 'role' | 'content'>

export interface ToolMessage {
  id: string
  timestamp: Date
  role: 'tool'
  content: string
  tool_call_id: string
}

export type ToolMessageContext = Pick<
  ToolMessage,
  'role' | 'content' | 'tool_call_id'
>

export interface SystemMessage {
  id: string
  timestamp: Date
  role: 'system'
  content: string
}

export type SystemMessageContext = Pick<SystemMessage, 'role' | 'content'>

export type Entry = UserMessage | AssistantMessage | SystemMessage | ToolMessage

export type Context = Array<
  | UserMessageContext
  | AssistantMessageContext
  | ToolMessageContext
  | SystemMessageContext
>

export type Loading = 'reasoning' | 'responding' | 'none'

export interface AgenticState {
  $entries: Atom<Array<Entry>>
  $loading: Atom<Loading>
  destroy(): void
  query(input: string): void
}
