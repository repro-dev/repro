import { Atom } from '@repro/atom'

export interface UserMessage {
  id: string
  timestamp: Date
  role: 'user'
  content: string
}

export interface AssistantMessage {
  id: string
  timestamp: Date
  role: 'assistant'
  content: string
  reasoning: string
}

export interface SystemMessage {
  id: string
  timestamp: Date
  role: 'system'
  content: string
}

export type Entry = UserMessage | AssistantMessage | SystemMessage
export type Context = Array<Pick<Entry, 'role' | 'content'>>
export type Loading = 'reasoning' | 'responding' | 'none'

export interface AgenticState {
  $entries: Atom<Array<Entry>>
  $loading: Atom<Loading>
  destroy(): void
  query(input: string): void
}
