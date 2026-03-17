import { Atom } from '@repro/atom'

export interface UserMessage {
  id: string
  timestamp: Date
  role: 'user'
  content: string
}

export type UserMessageContext = Pick<UserMessage, 'role' | 'content'>

export interface AssistantMessage {
  id: string
  timestamp: Date
  role: 'assistant'
  content: string
}

export type AssistantMessageContext = Pick<AssistantMessage, 'role' | 'content'>

export interface SystemMessage {
  id: string
  timestamp: Date
  role: 'system'
  content: string
}

export type SystemMessageContext = Pick<SystemMessage, 'role' | 'content'>

export type Entry = UserMessage | AssistantMessage | SystemMessage

export type Context = Array<
  UserMessageContext | AssistantMessageContext | SystemMessageContext
>

export type Loading = 'reasoning' | 'responding' | 'none'

export interface AgenticState {
  $entries: Atom<Array<Entry>>
  $loading: Atom<Loading>
  destroy(): void
  query(input: string): void
}
