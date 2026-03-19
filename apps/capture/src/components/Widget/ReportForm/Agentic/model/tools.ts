import {
  ConsoleEvent,
  DateMessagePart,
  LogLevel,
  MessagePartType,
  NodeType,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import {
  findIndexedNetworkEvents,
  groupNetworkEvents,
} from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { buildA11yTree, formatA11yTree } from '@repro/vdom-utils'
import { RecordingDataAccessor } from '../types'

function estimateTokens(obj: unknown): number {
  return Math.ceil(JSON.stringify(obj).length / 4)
}

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

const GET_DOM_STATE = {
  type: 'function',
  function: {
    name: 'getDOMState',
    description:
      'Get the state of the DOM at a specific timestamp, either as an accessibility tree (a11y mode) or a summary of element counts (summary mode).',
    parameters: {
      type: 'object',
      properties: {
        timestampMs: {
          type: 'number',
          description:
            'Timestamp in milliseconds from the start of the recording.',
        },
        mode: {
          type: 'string',
          enum: ['a11y', 'summary'],
          default: 'a11y',
          description:
            'The mode for DOM state output. Use "a11y" for accessibility tree, "summary" for element counts.',
        },
      },
    },
  },
}

export const tools = [
  GET_RECORDING_DURATION,
  GET_CONSOLE_MESSAGES,
  GET_NETWORK_REQUESTS,
  GET_DOM_STATE,
]

export type ToolHandler = (
  recording: RecordingDataAccessor,
  args: Record<string, unknown>
) => unknown

const toolHandlers: Record<string, ToolHandler> = {
  getRecordingDuration: recording => ({
    durationMs: recording.getDuration(),
  }),

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

    const statusMin = args.statusMin as number | undefined
    const statusMax = args.statusMax as number | undefined
    const method = args.method as string | undefined
    const urlPattern = args.urlPattern as string | undefined
    const timeStart = args.timeRangeStartMs as number | undefined
    const timeEnd = args.timeRangeEndMs as number | undefined

    const requests: Array<{
      timeMs: number
      type: 'fetch' | 'ws'
      method?: string
      url: string
      status?: number
      responseTimeMs?: number
      durationMs?: number
      requestHeaders?: Record<string, string>
      responseHeaders?: Record<string, string>
    }> = []

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

        requests.push({
          timeMs: time,
          type: 'fetch',
          method: group.request.method,
          url: group.request.url,
          status,
          responseTimeMs: group.responseTime,
          durationMs:
            group.responseTime !== undefined
              ? group.responseTime - time
              : undefined,
          requestHeaders: group.request.headers,
          responseHeaders: group.response?.headers,
        })
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

        requests.push({
          timeMs: time,
          type: 'ws',
          url: group.open.url,
          durationMs:
            group.closeTime !== undefined ? group.closeTime - time : undefined,
        })
      }
    }

    return { requests }
  },

  getDOMState: (recording, args) => {
    const timestampMs = (args.timestampMs as number) ?? 0
    const mode = (args.mode as string) ?? 'a11y'
    const snapshot = recording.getSnapshotAtTime(timestampMs)

    if (!snapshot || !snapshot.dom) {
      const err = { error: 'No DOM snapshot available at this timestamp' }
      return { ...err, _tokenEstimate: estimateTokens(err) }
    }

    const vtree = snapshot.dom

    if (mode === 'a11y') {
      const tree = buildA11yTree(vtree)

      if (!tree) {
        const err = { error: 'Could not build accessibility tree' }
        return { ...err, _tokenEstimate: estimateTokens(err) }
      }

      const formatted = formatA11yTree(tree)
      const result = { mode: 'a11y' as const, tree: formatted, timestampMs }
      return { ...result, _tokenEstimate: estimateTokens(result) }
    }

    let elementCount = 0
    let textCount = 0
    const tagCounts: Record<string, number> = {}

    for (const node of Object.values(vtree.nodes)) {
      if (node.match(n => n.type === NodeType.Element)) {
        elementCount++
        const tagName = (
          node as Box<{ type: typeof NodeType.Element; tagName: string }>
        )
          .get('tagName')
          .orElse('unknown')
        tagCounts[tagName] = (tagCounts[tagName] ?? 0) + 1
      } else if (node.match(n => n.type === NodeType.Text)) {
        textCount++
      }
    }

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }))

    const result = {
      mode: 'summary' as const,
      elementCount,
      textCount,
      topTags,
      timestampMs,
    }
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
