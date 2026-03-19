import {
  ConsoleEvent,
  DateMessagePart,
  LogLevel,
  MessagePartType,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import {
  findIndexedNetworkEvents,
  groupNetworkEvents,
} from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { RecordingDataAccessor } from '../types'
import {
  DetailLevel,
  estimateTokens,
  shortenUrl,
  truncate,
} from './token-optimization'

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  verbose: LogLevel.Verbose,
  info: LogLevel.Info,
  warning: LogLevel.Warning,
  error: LogLevel.Error,
}

const LOG_LEVEL_NAMES: Record<number, string> = {
  [LogLevel.Verbose]: 'verbose',
  [LogLevel.Info]: 'info',
  [LogLevel.Warning]: 'warning',
  [LogLevel.Error]: 'error',
}

function isConsoleEvent(event: SourceEvent): event is Box<ConsoleEvent> {
  return event.match(e => e.type === SourceEventType.Console)
}

function formatDatePart(part: DateMessagePart): string {
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

function serializeMessagePart(part: Box<{ type: MessagePartType }>): string {
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

const GET_RECORDING_DURATION = {
  type: 'function',
  function: {
    name: 'getRecordingDuration',
    description: 'Get the duration of the recording.',
    parameters: {
      type: 'object',
      properties: {
        detail: {
          type: 'string',
          enum: ['summary', 'normal', 'full'],
          default: 'normal',
          description:
            "Level of detail in the response. Use 'summary' for initial triage, 'normal' for standard debugging, 'full' for deep investigation.",
        },
      },
    },
  },
}

const GET_CONSOLE_MESSAGES = {
  type: 'function',
  function: {
    name: 'getConsoleMessages',
    description:
      'Get recorded console messages, with an optional minimum log level and time range.',
    parameters: {
      type: 'object',
      properties: {
        detail: {
          type: 'string',
          enum: ['summary', 'normal', 'full'],
          default: 'normal',
          description:
            "Level of detail in the response. Use 'summary' for initial triage, 'normal' for standard debugging, 'full' for deep investigation.",
        },
        logLevel: {
          type: 'string',
          enum: ['verbose', 'info', 'warning', 'error'],
          default: 'info',
          description: 'The minimum level of logs to include.',
        },
        timeRangeStartMs: {
          type: 'number',
          description:
            'The start of the time range for returned log messages. If omitted, this will default to the start of the recording.',
        },
        timeRangeEndMs: {
          type: 'number',
          description:
            'The end of the time range for returned log messages. If omitted, this will default to the end of the recording.',
        },
      },
    },
  },
}

const GET_NETWORK_REQUESTS = {
  type: 'function',
  function: {
    name: 'getNetworkRequests',
    description:
      'Get recorded network requests (fetch/XHR/WebSocket), with optional filters.',
    parameters: {
      type: 'object',
      properties: {
        detail: {
          type: 'string',
          enum: ['summary', 'normal', 'full'],
          default: 'normal',
          description:
            "Level of detail in the response. Use 'summary' for initial triage, 'normal' for standard debugging, 'full' for deep investigation.",
        },
        statusMin: {
          type: 'number',
          description:
            'Minimum HTTP status code to include (e.g. 400 for errors only).',
        },
        statusMax: {
          type: 'number',
          description: 'Maximum HTTP status code to include.',
        },
        method: {
          type: 'string',
          description: 'Filter by HTTP method (e.g. GET, POST).',
        },
        urlPattern: {
          type: 'string',
          description: 'Substring to match against request URLs.',
        },
        timeRangeStartMs: {
          type: 'number',
          description: 'Start of time range in ms from recording start.',
        },
        timeRangeEndMs: {
          type: 'number',
          description: 'End of time range in ms from recording start.',
        },
      },
    },
  },
}

export const tools = [
  GET_RECORDING_DURATION,
  GET_CONSOLE_MESSAGES,
  GET_NETWORK_REQUESTS,
]

const ALLOWED_HEADERS = ['content-type', 'x-request-id']

function filterHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (ALLOWED_HEADERS.includes(lower)) {
      result[key] = value
    }
  }
  return result
}

function decodeBody(body: ArrayBuffer): string {
  try {
    return new TextDecoder().decode(body)
  } catch {
    return ''
  }
}

export type ToolHandler = (
  recording: RecordingDataAccessor,
  args: Record<string, unknown>
) => unknown

const toolHandlers: Record<string, ToolHandler> = {
  getRecordingDuration: recording => {
    const result = { durationMs: recording.getDuration() }
    return { ...result, _tokenEstimate: estimateTokens(result) }
  },

  getConsoleMessages: (recording, args) => {
    const events = recording.getSourceEvents()
    const logLevelStr = (args.logLevel as string) ?? 'info'
    const minLevel = LOG_LEVEL_MAP[logLevelStr] ?? LogLevel.Info
    const timeStart = args.timeRangeStartMs as number | undefined
    const timeEnd = args.timeRangeEndMs as number | undefined

    const messages: Array<{
      timeMs: number
      level: string
      text: string
      stack?: Array<{
        functionName?: string
        fileName: string
        line: number
        column: number
      }>
    }> = []

    for (let i = 0, len = events.size(); i < len; i++) {
      const event = events.over(i)
      if (!event) continue
      if (!isConsoleEvent(event)) continue

      const consoleEvent: Box<ConsoleEvent> = event

      const time = consoleEvent.get('time').orElse(0)
      if (timeStart !== undefined && time < timeStart) continue
      if (timeEnd !== undefined && time > timeEnd) continue

      const level = consoleEvent.get('data').get('level').orElse(LogLevel.Info)
      if (level < minLevel) continue

      const parts = consoleEvent.get('data').get('parts').orElse([])
      const text = parts.map(serializeMessagePart).join(' ')

      const stackEntries = consoleEvent.get('data').get('stack').orElse([])
      const stack = stackEntries.map(entry => ({
        functionName: entry.functionName ?? undefined,
        fileName: entry.fileName,
        line: entry.lineNumber,
        column: entry.columnNumber,
      }))

      messages.push({
        timeMs: time,
        level: LOG_LEVEL_NAMES[level] ?? 'info',
        text,
        ...(stack.length > 0 ? { stack } : {}),
      })
    }

    return { messages }
  },

  getNetworkRequests: (recording, args) => {
    const events = recording.getSourceEvents()
    const indexed = findIndexedNetworkEvents(events)
    const groups = groupNetworkEvents(indexed)

    const detail = (args.detail as DetailLevel | undefined) ?? 'normal'
    const statusMin = args.statusMin as number | undefined
    const statusMax = args.statusMax as number | undefined
    const method = args.method as string | undefined
    const urlPattern = args.urlPattern as string | undefined
    const timeStart = args.timeRangeStartMs as number | undefined
    const timeEnd = args.timeRangeEndMs as number | undefined

    const requests: Array<Record<string, unknown>> = []

    let succeeded = 0
    let failed = 0
    const byMethod: Record<string, number> = {}

    for (const group of groups) {
      if (group.type === 'fetch') {
        const time = group.requestTime
        if (timeStart !== undefined && time < timeStart) continue
        if (timeEnd !== undefined && time > timeEnd) continue
        if (
          method !== undefined &&
          group.request.method.toUpperCase() !== method.toUpperCase()
        )
          continue
        if (urlPattern !== undefined && !group.request.url.includes(urlPattern))
          continue

        const status = group.response?.status
        if (
          statusMin !== undefined &&
          (status === undefined || status < statusMin)
        )
          continue
        if (
          statusMax !== undefined &&
          (status === undefined || status > statusMax)
        )
          continue

        if (status !== undefined && status >= 400) {
          failed++
        } else {
          succeeded++
        }

        const m = group.request.method.toUpperCase()
        byMethod[m] = (byMethod[m] ?? 0) + 1

        const rawUrl = group.request.url
        let url: string
        if (detail === 'summary') {
          try {
            url = new URL(rawUrl).pathname
          } catch {
            url = rawUrl
          }
        } else if (detail === 'normal') {
          url = truncate(shortenUrl(rawUrl, 'pathname'), 100)
        } else {
          url = shortenUrl(rawUrl, 'full')
        }

        const durationMs =
          group.responseTime !== undefined
            ? group.responseTime - time
            : undefined

        if (detail === 'summary') {
          const entry: Record<string, unknown> = {
            timeMs: time,
            type: 'fetch',
            url,
          }
          if (status !== undefined) entry['status'] = status
          requests.push(entry)
        } else if (detail === 'normal') {
          const entry: Record<string, unknown> = {
            timeMs: time,
            type: 'fetch',
            method: group.request.method,
            url,
          }
          if (status !== undefined) entry['status'] = status
          const contentType = group.response?.headers?.['content-type']
          if (contentType !== undefined) entry['contentType'] = contentType
          if (durationMs !== undefined) entry['durationMs'] = durationMs
          if (status !== undefined && status >= 400 && group.response?.body) {
            const decoded = decodeBody(group.response.body)
            if (decoded) entry['errorBody'] = truncate(decoded, 500)
          }
          requests.push(entry)
        } else {
          const entry: Record<string, unknown> = {
            timeMs: time,
            type: 'fetch',
            method: group.request.method,
            url,
          }
          if (status !== undefined) entry['status'] = status
          const contentType = group.response?.headers?.['content-type']
          if (contentType !== undefined) entry['contentType'] = contentType
          if (durationMs !== undefined) entry['durationMs'] = durationMs
          if (group.responseTime !== undefined)
            entry['responseTimeMs'] = group.responseTime
          const filteredHeaders = filterHeaders(
            group.response?.headers ?? {}
          )
          if (Object.keys(filteredHeaders).length > 0)
            entry['headers'] = filteredHeaders
          if (status !== undefined && status >= 400 && group.response?.body) {
            const decoded = decodeBody(group.response.body)
            if (decoded) entry['errorBody'] = truncate(decoded, 2000)
          }
          const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE']
          if (
            mutationMethods.includes(group.request.method.toUpperCase()) &&
            group.request.body
          ) {
            const decoded = decodeBody(group.request.body)
            if (decoded) entry['requestBody'] = truncate(decoded, 500)
          }
          requests.push(entry)
        }
      } else {
        const time = group.openTime
        if (timeStart !== undefined && time < timeStart) continue
        if (timeEnd !== undefined && time > timeEnd) continue
        if (urlPattern !== undefined && !group.open.url.includes(urlPattern))
          continue
        if (
          statusMin !== undefined ||
          statusMax !== undefined ||
          method !== undefined
        )
          continue

        const rawUrl = group.open.url
        let url: string
        if (detail === 'summary') {
          try {
            url = new URL(rawUrl).pathname
          } catch {
            url = rawUrl
          }
        } else if (detail === 'normal') {
          url = truncate(shortenUrl(rawUrl, 'pathname'), 100)
        } else {
          url = shortenUrl(rawUrl, 'full')
        }

        const durationMs =
          group.closeTime !== undefined ? group.closeTime - time : undefined

        if (detail === 'summary') {
          requests.push({ timeMs: time, type: 'ws', url })
        } else {
          const entry: Record<string, unknown> = { timeMs: time, type: 'ws', url }
          if (durationMs !== undefined) entry['durationMs'] = durationMs
          requests.push(entry)
        }
      }
    }

    const summary = {
      total: requests.length,
      succeeded,
      failed,
      byMethod,
    }

    const result = { requests, summary }
    return { ...result, _tokenEstimate: estimateTokens(result) }
  },
}

export function executeTool(
  recording: RecordingDataAccessor,
  name: string,
  args: Record<string, unknown>
): unknown {
  const handler = toolHandlers[name]

  if (!handler) {
    return { error: `Unknown tool: ${name}` }
  }

  return handler(recording, args)
}
