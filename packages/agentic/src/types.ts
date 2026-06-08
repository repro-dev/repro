import { Atom } from '@repro/atom'
import { Snapshot, SourceEvent, SourceEventType } from '@repro/domain'
import { FutureInstance } from 'fluture'

export interface RecordingDataAccessor {
  getDuration(): number
  getSnapshotAtTime(timestampMs: number): Snapshot | null
  // Returns a map of absolute original URL → resolved URL (blob URL or proxied
  // API URL) ready to pass directly to createDOMFromVTree as its resourceMap
  // argument. Inversion and base-URL construction are the caller's responsibility.
  getResourceMap(): Record<string, string>
  getEventsByType(
    types: Array<SourceEventType>,
    opts?: {
      startMs?: number
      endMs?: number
      limit?: number
      offset?: number
    }
  ): Array<SourceEvent>
  getEventsInRange(
    startMs: number,
    endMs: number,
    opts?: { types?: Array<SourceEventType>; limit?: number; offset?: number }
  ): Array<SourceEvent>
}

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

export interface AssistantMessageContext {
  role: 'assistant'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

// Vision content blocks for OpenAI-compatible APIs
export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface ImageUrlContentBlock {
  type: 'image_url'
  image_url: { url: string }
}

export type ContentBlock = TextContentBlock | ImageUrlContentBlock

export interface ToolMessage {
  id: string
  timestamp: Date
  role: 'tool'
  // Plain string for most tools; array of content blocks for tools that
  // return visual data (e.g. captureScreenshot returns an image_url block).
  content: string | Array<ContentBlock>
  tool_call_id: string
}

export interface ToolMessageContext {
  role: 'tool'
  content: string | Array<ContentBlock>
  tool_call_id: string
}

export interface AskUserChoice {
  label: string
  value: string
  description?: string
}

export interface AskUserRequest {
  prompt: string
  choices?: Array<AskUserChoice>
  multiple?: boolean
  allowFreeform?: boolean
}

export interface AskUserResult {
  answer: string | Array<string>
  freeformAnswer?: string
}

export interface PendingAskUserInteraction {
  id: string
  toolCallId: string
  request: AskUserRequest
  createdAt: Date
}

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

export type Loading =
  | 'reasoning'
  | 'responding'
  | 'tool-executing'
  | 'cancelled'
  | 'none'

export type InvestigationStage =
  | 'idle'
  | 'orient'
  | 'hypotheses'
  | 'evidence'
  | 'conclusion'

export type InvestigationReadiness = 'needs more evidence' | 'ready to conclude'

export interface Hypothesis {
  id: string
  description: string
  evidence: Array<string>
  confidence: 'low' | 'medium' | 'high'
}

export interface AdvanceStageInput {
  stage: Exclude<InvestigationStage, 'idle'>
  hypotheses?: Array<Hypothesis>
}

export interface AdvanceStageResult {
  stage: InvestigationStage
  hypotheses: Array<Hypothesis>
  readiness: InvestigationReadiness
  _tokenEstimate?: number
}

export interface AdvanceStageError {
  error: string
  reason: string
  suggestion: string
}

export type AdvanceStageOutcome = AdvanceStageResult | AdvanceStageError

export interface DiagnosisContent {
  diagnosis: string
  inference: string
  recommendations: string[]
}

export type Audience = 'extension' | 'workspace'

export interface AgenticError {
  message: string
  retryable: boolean
  attempt: number
}

export interface AgenticState {
  $entries: Atom<Array<Entry>>
  $loading: Atom<Loading>
  $error: Atom<AgenticError | null>
  $wasCancelled: Atom<boolean>
  $stage: Atom<InvestigationStage>
  $hypotheses: Atom<Array<Hypothesis>>
  $pendingInteraction: Atom<PendingAskUserInteraction | null>
  // ID of the first surviving entry after context-window truncation, or null if
  // no messages were dropped on the last inference call.
  $truncatedBefore: Atom<string | null>
  cancel(): void
  destroy(): void
  submitAskUserAnswer(answer: AskUserResult): void
  query(input: string): void
  reset(): void
}

export interface ToolExecutionContext {
  toolCall?: ToolCall
  askUser?: (
    request: AskUserRequest,
    toolCallId: string
  ) => FutureInstance<unknown, AskUserResult>
  advanceStage?: (
    input: AdvanceStageInput
  ) => FutureInstance<unknown, AdvanceStageOutcome>
}

export interface ToolDefinition {
  type: string
  function: {
    name: string
    description: string
    parameters?: object
  }
}

export interface RecordingMeta {
  browser: string | null
  durationMs: number | null
  recordingUrl: string | null
}

export type StreamProvider = (
  context: Context,
  tools: ToolDefinition[],
  signal?: AbortSignal
) => FutureInstance<unknown, ReadableStream<{ data: string }>>
