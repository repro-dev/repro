import {
  ConsoleEvent,
  DateMessagePart,
  DOMPatchEvent,
  InteractionEvent,
  LogLevel,
  MessagePartType,
  NetworkEvent,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { FutureInstance } from 'fluture'
import { RecordingDataAccessor } from '../../types'

export type ToolHandler = (
  recording: RecordingDataAccessor,
  args: Record<string, unknown>
) => FutureInstance<unknown, unknown>

export function createError(
  error: string,
  reason?: string,
  suggestion?: string
): { error: string; reason?: string; suggestion?: string } {
  const result: { error: string; reason?: string; suggestion?: string } = {
    error,
  }
  if (reason !== undefined) result.reason = reason
  if (suggestion !== undefined) result.suggestion = suggestion
  return result
}

export const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  verbose: LogLevel.Verbose,
  info: LogLevel.Info,
  warning: LogLevel.Warning,
  error: LogLevel.Error,
}

export const LOG_LEVEL_NAMES: Record<number, string> = {
  [LogLevel.Verbose]: 'verbose',
  [LogLevel.Info]: 'info',
  [LogLevel.Warning]: 'warning',
  [LogLevel.Error]: 'error',
}

export function isConsoleEvent(event: SourceEvent): event is Box<ConsoleEvent> {
  return event.match(e => e.type === SourceEventType.Console)
}

export function isInteractionEvent(
  event: SourceEvent
): event is Box<InteractionEvent> {
  return event.match(e => e.type === SourceEventType.Interaction)
}

export function isDOMPatchEvent(
  event: SourceEvent
): event is Box<DOMPatchEvent> {
  return event.match(e => e.type === SourceEventType.DOMPatch)
}

export function isNetworkEvent(event: SourceEvent): event is Box<NetworkEvent> {
  return event.match(e => e.type === SourceEventType.Network)
}

export function formatDatePart(part: DateMessagePart): string {
  const date = new Date(
    Date.UTC(
      part.year,
      part.month - 1,
      part.day,
      part.hour,
      part.minute,
      part.second,
      part.millisecond
    )
  )
  return date.toISOString()
}

export function serializeMessagePart(
  part: Box<{ type: MessagePartType }>
): string {
  if (part.match(p => p.type === MessagePartType.String)) {
    return (part as Box<{ type: MessagePartType.String; value: string }>)
      .get('value')
      .orElse('')
  }

  if (part.match(p => p.type === MessagePartType.Node)) {
    return '[DOM Node]'
  }

  if (part.match(p => p.type === MessagePartType.Undefined)) {
    return 'undefined'
  }

  if (part.match(p => p.type === MessagePartType.Date)) {
    return (part as Box<DateMessagePart>).map(formatDatePart).orElse('')
  }

  return ''
}
