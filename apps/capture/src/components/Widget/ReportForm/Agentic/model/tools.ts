import {
  Click,
  ConsoleEvent,
  DateMessagePart,
  DOMPatchEvent,
  DoubleClick,
  InteractionEvent,
  InteractionType,
  KeyDown,
  LogLevel,
  MessagePartType,
  NetworkEvent,
  PageTransition,
  Scroll,
  SourceEvent,
  SourceEventType,
  ViewportResize,
} from '@repro/domain'
import {
  findIndexedNetworkEvents,
  groupNetworkEvents,
} from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { RecordingDataAccessor } from '../types'

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

function isInteractionEvent(event: SourceEvent): event is Box<InteractionEvent> {
  return event.match(e => e.type === SourceEventType.Interaction)
}

function isDOMPatchEvent(event: SourceEvent): event is Box<DOMPatchEvent> {
  return event.match(e => e.type === SourceEventType.DOMPatch)
}

function isNetworkEvent(event: SourceEvent): event is Box<NetworkEvent> {
  return event.match(e => e.type === SourceEventType.Network)
}

function summarizeInteraction(
  event: Box<InteractionEvent>
): { type: string; [key: string]: unknown } | null {
  const interaction = event.get('data').flat() as Box<
    | ViewportResize
    | Scroll
    | KeyDown
    | Click
    | DoubleClick
    | PageTransition
  >
  const interactionType = interaction.get('type').orElse(-1 as InteractionType)

  switch (interactionType) {
    case InteractionType.PointerMove:
    case InteractionType.PointerDown:
    case InteractionType.PointerUp:
      return null

    case InteractionType.Click:
    case InteractionType.DoubleClick: {
      const clickEvent = interaction as Box<Click | DoubleClick>
      const label = clickEvent.get('meta').get('humanReadableLabel').orElse(null)
      return {
        type: interactionType === InteractionType.Click ? 'click' : 'doubleClick',
        ...(label ? { label } : {}),
      }
    }

    case InteractionType.KeyDown: {
      const keyEvent = interaction as Box<KeyDown>
      return { type: 'keyDown', key: keyEvent.get('key').orElse('') }
    }

    case InteractionType.KeyUp:
      return null

    case InteractionType.Scroll: {
      const scrollEvent = interaction as Box<Scroll>
      const target = scrollEvent.get('target').orElse('' as unknown as number)
      return { type: 'scroll', target: String(target) }
    }

    case InteractionType.PageTransition: {
      const pageEvent = interaction as Box<PageTransition>
      const from = pageEvent.get('from').orElse(null)
      const to = pageEvent.get('to').orElse('')
      return {
        type: 'pageTransition',
        ...(from ? { from } : {}),
        to,
      }
    }

    case InteractionType.ViewportResize: {
      const resizeEvent = interaction as Box<ViewportResize>
      const to = resizeEvent.get('to').orElse([0, 0] as [number, number])
      return {
        type: 'viewportResize',
        to: { width: to[0], height: to[1] },
      }
    }

    default:
      return null
  }
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

const GET_EVENTS_AROUND_TIME = {
  type: 'function',
  function: {
    name: 'getEventsAroundTime',
    description:
      'Get events that occurred around a specific timestamp. Useful for understanding context around an error or user action.',
    parameters: {
      type: 'object',
      properties: {
        timestampMs: {
          type: 'number',
          description:
            'The timestamp in ms from recording start to center the window on.',
        },
        windowMs: {
          type: 'number',
          description:
            'Total window size in ms (default 5000). Events from [timestampMs - windowMs/2, timestampMs + windowMs/2] are returned.',
        },
      },
      required: ['timestampMs'],
    },
  },
}

export const tools = [
  GET_RECORDING_DURATION,
  GET_CONSOLE_MESSAGES,
  GET_NETWORK_REQUESTS,
  GET_EVENTS_AROUND_TIME,
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

  getEventsAroundTime: (recording, args) => {
    const timestampMs = args.timestampMs as number
    const windowMs = (args.windowMs as number) ?? 5000
    const halfWindow = windowMs / 2
    const startTime = Math.max(0, timestampMs - halfWindow)
    const endTime = Math.min(recording.getDuration(), timestampMs + halfWindow)

    const events = recording.getSourceEvents()
    const result: Array<{
      timeMs: number
      type: string
      [key: string]: unknown
    }> = []

    for (let i = 0, len = events.size(); i < len; i++) {
      const event = events.over(i)
      if (!event) continue

      const time = event.get('time').orElse(0)
      if (time < startTime) continue
      if (time > endTime) break

      if (isInteractionEvent(event)) {
        const summary = summarizeInteraction(event)
        if (!summary) continue
        result.push({ timeMs: time, ...summary })
        continue
      }

      if (isDOMPatchEvent(event)) {
        continue
      }

      if (event.match(e => e.type === SourceEventType.Snapshot)) {
        continue
      }

      if (isNetworkEvent(event)) {
        result.push({ timeMs: time, type: 'network' })
        continue
      }

      if (isConsoleEvent(event)) {
        const consoleEvent: Box<ConsoleEvent> = event
        const level = consoleEvent.get('data').get('level').orElse(LogLevel.Info)
        const parts = consoleEvent.get('data').get('parts').orElse([])
        const text = parts.map(serializeMessagePart).join(' ')
        result.push({
          timeMs: time,
          type: 'console',
          level: LOG_LEVEL_NAMES[level] ?? 'info',
          text,
        })
        continue
      }

      if (event.match(e => e.type === SourceEventType.Performance)) {
        result.push({ timeMs: time, type: 'performance' })
        continue
      }
    }

    return {
      centerMs: timestampMs,
      windowMs,
      rangeStartMs: startTime,
      rangeEndMs: endTime,
      events: result,
      _tokenEstimate: Math.ceil(JSON.stringify(result).length / 4) + 20,
    }
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
