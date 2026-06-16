import { ConsoleEvent, LogLevel, MessagePartType } from '@repro/domain'
import { Box } from '@repro/tdl'

export interface ConsoleTextInfo {
  time: number
  level: LogLevel
  text: string
}

/**
 * Extract time, numeric log level, and joined message text from a boxed
 * ConsoleEvent. The `serializePart` callback (typically serializeMessagePart
 * from agentic/common.ts) converts individual message parts to strings.
 * Callers apply LOG_LEVEL_NAMES[level] for the string name if needed.
 */
export function extractConsoleText(
  event: Box<ConsoleEvent>,
  serializePart: (part: Box<{ type: MessagePartType }>) => string
): ConsoleTextInfo {
  const time = event.get('time').orElse(0)
  const level = event.get('data').get('level').orElse(LogLevel.Info)
  const parts = event.get('data').get('parts').orElse([])
  const text = parts.map(serializePart).join(' ')
  return { time, level, text }
}
