import {
  ConsoleEvent,
  DateMessagePart,
  DOMPatchEvent,
  InteractionEvent,
  InteractionType,
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

const GET_EVENTS = {
  type: 'function',
  function: {
    name: 'getEvents',
    description:
      'Get a timeline of events from the recording, filtered by type and time range. Returns user interactions, page transitions, and DOM activity.',
    parameters: {
      type: 'object',
      properties: {
        detail: {
          type: 'string',
          enum: ['summary', 'normal', 'full'],
          default: 'normal',
          description:
            'Level of detail: summary (counts only), normal (key events), full (all events).',
        },
        startTimeMs: {
          type: 'number',
          description: 'Start of time range in ms from recording start.',
        },
        endTimeMs: {
          type: 'number',
          description: 'End of time range in ms from recording start.',
        },
        eventTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'click',
              'doubleClick',
              'keyDown',
              'keyUp',
              'scroll',
              'pageTransition',
              'viewportResize',
              'domPatch',
              'network',
              'console',
              'performance',
            ],
          },
          description:
            'Filter to specific event types. If omitted, returns all types.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default 100).',
        },
      },
    },
  },
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

export const tools = [
  GET_RECORDING_DURATION,
  GET_CONSOLE_MESSAGES,
  GET_NETWORK_REQUESTS,
  GET_EVENTS,
]

function isInteractionEvent(event: SourceEvent): event is Box<InteractionEvent> {
  return event.match(e => e.type === SourceEventType.Interaction)
}

function isDOMPatchEvent(event: SourceEvent): event is Box<DOMPatchEvent> {
  return event.match(e => e.type === SourceEventType.DOMPatch)
}

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

  getNetworkRequests: (recording, args) => {    const events = recording.getSourceEvents()
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

  getEvents: (recording, args) => {
    const events = recording.getSourceEvents()
    const detail = (args.detail as string) ?? 'normal'
    const startTime = args.startTimeMs as number | undefined
    const endTime = args.endTimeMs as number | undefined
    const eventTypeFilter = args.eventTypes as string[] | undefined
    const limit = (args.limit as number) ?? 100

    const resultEvents: Array<Record<string, unknown>> = []
    const domPatchBuckets: Record<number, number> = {}
    let hasMore = false

    let pendingKeys: Array<{ time: number; key: string }> = []

    function flushKeystrokes() {
      if (pendingKeys.length === 0) return
      if (detail === 'normal') {
        const text = pendingKeys
          .map(k => (k.key.length === 1 ? k.key : `[${k.key}]`))
          .join('')
        resultEvents.push({
          time: pendingKeys[0]!.time,
          type: 'typed',
          text,
        })
      } else if (detail === 'full') {
        for (const k of pendingKeys) {
          resultEvents.push({
            time: k.time,
            type: 'keyDown',
            key: k.key,
          })
        }
      }
      pendingKeys = []
    }

    for (let i = 0, len = events.size(); i < len; i++) {
      const event = events.over(i)
      if (!event) continue

      const time = event.get('time').orElse(0)
      if (startTime !== undefined && time < startTime) continue
      if (endTime !== undefined && time > endTime) continue

      if (isInteractionEvent(event)) {
        const interactionData = (event as Box<InteractionEvent>)
          .get('data')
          .orElse(null) as Box<any> | null
        if (!interactionData) continue
        const interactionType = interactionData
          .get('type')
          .orElse(-1 as InteractionType)

        if (
          interactionType === InteractionType.PointerMove ||
          interactionType === InteractionType.PointerDown ||
          interactionType === InteractionType.PointerUp
        ) {
          continue
        }

        const typeNameMap: Record<number, string> = {
          [InteractionType.Click]: 'click',
          [InteractionType.DoubleClick]: 'doubleClick',
          [InteractionType.KeyDown]: 'keyDown',
          [InteractionType.KeyUp]: 'keyUp',
          [InteractionType.Scroll]: 'scroll',
          [InteractionType.PageTransition]: 'pageTransition',
          [InteractionType.ViewportResize]: 'viewportResize',
        }
        const typeName = typeNameMap[interactionType]
        if (typeName && eventTypeFilter && !eventTypeFilter.includes(typeName))
          continue

        if (
          interactionType === InteractionType.Click ||
          interactionType === InteractionType.DoubleClick
        ) {
          flushKeystrokes()
          const label = interactionData
            .get('meta')
            .get('humanReadableLabel')
            .orElse(null)
          const at = interactionData.get('at').orElse([0, 0])
          const eventType =
            interactionType === InteractionType.Click ? 'click' : 'doubleClick'
          if (detail === 'full') {
            resultEvents.push({
              time,
              type: eventType,
              ...(label ? { label } : {}),
              at: { x: at[0], y: at[1] },
            })
          } else {
            resultEvents.push({
              time,
              type: eventType,
              ...(label ? { label } : {}),
            })
          }
        } else if (interactionType === InteractionType.KeyDown) {
          if (detail === 'summary') continue
          const key = interactionData.get('key').orElse('')
          pendingKeys.push({ time, key })
        } else if (interactionType === InteractionType.KeyUp) {
          continue
        } else if (interactionType === InteractionType.Scroll) {
          flushKeystrokes()
          if (detail === 'summary') continue
          const target = interactionData.get('target').orElse('')
          const to = interactionData.get('to').orElse([0, 0])
          if (detail === 'full') {
            const from = interactionData.get('from').orElse([0, 0])
            resultEvents.push({
              time,
              type: 'scroll',
              target,
              from: { x: from[0], y: from[1] },
              to: { x: to[0], y: to[1] },
            })
          } else {
            resultEvents.push({
              time,
              type: 'scroll',
              target,
              to: { x: to[0], y: to[1] },
            })
          }
        } else if (interactionType === InteractionType.PageTransition) {
          flushKeystrokes()
          const from = interactionData.get('from').orElse(null)
          const to = interactionData.get('to').orElse('')
          resultEvents.push({
            time,
            type: 'pageTransition',
            ...(from ? { from } : {}),
            to,
          })
        } else if (interactionType === InteractionType.ViewportResize) {
          flushKeystrokes()
          if (detail === 'summary') continue
          const to = interactionData.get('to').orElse([0, 0])
          if (detail === 'full') {
            const from = interactionData.get('from').orElse([0, 0])
            resultEvents.push({
              time,
              type: 'viewportResize',
              from: { width: from[0], height: from[1] },
              to: { width: to[0], height: to[1] },
            })
          } else {
            resultEvents.push({
              time,
              type: 'viewportResize',
              to: { width: to[0], height: to[1] },
            })
          }
        }
        continue
      }

      if (isDOMPatchEvent(event)) {
        if (eventTypeFilter && !eventTypeFilter.includes('domPatch')) continue
        const bucket = Math.floor(time / 1000)
        domPatchBuckets[bucket] = (domPatchBuckets[bucket] ?? 0) + 1
        continue
      }

      if (event.match(e => e.type === SourceEventType.Snapshot)) continue

      if (event.match(e => e.type === SourceEventType.Network)) {
        if (eventTypeFilter && !eventTypeFilter.includes('network')) continue
        flushKeystrokes()
        resultEvents.push({ time, type: 'network' })
        continue
      }

      if (isConsoleEvent(event)) {
        if (eventTypeFilter && !eventTypeFilter.includes('console')) continue
        flushKeystrokes()
        const consoleEvent: Box<ConsoleEvent> = event
        const level = consoleEvent.get('data').get('level').orElse(LogLevel.Info)
        resultEvents.push({
          time,
          type: 'console',
          level: LOG_LEVEL_NAMES[level] ?? 'info',
        })
        continue
      }

      if (event.match(e => e.type === SourceEventType.Performance)) {
        if (eventTypeFilter && !eventTypeFilter.includes('performance')) continue
        flushKeystrokes()
        resultEvents.push({ time, type: 'performance' })
        continue
      }
    }

    flushKeystrokes()

    let limitedEvents = resultEvents
    if (resultEvents.length > limit) {
      limitedEvents = resultEvents.slice(0, limit)
      hasMore = true
    }

    if (detail === 'summary') {
      const counts: Record<string, number> = {}
      for (const ev of resultEvents) {
        const t = ev['type'] as string
        counts[t] = (counts[t] ?? 0) + 1
      }
      const totalDomPatches = Object.values(domPatchBuckets).reduce(
        (a, b) => a + b,
        0
      )
      if (totalDomPatches > 0) {
        counts['domPatch'] = totalDomPatches
      }
      const totalEvents = Object.values(counts).reduce((a, b) => a + b, 0)
      return {
        totalEvents,
        counts,
        durationMs: recording.getDuration(),
        _tokenEstimate:
          Math.ceil(JSON.stringify(counts).length / 4) + 20,
      }
    }

    const domActivity: Array<{ window: string; patchCount: number }> = []
    const bucketKeys = Object.keys(domPatchBuckets)
      .map(Number)
      .sort((a, b) => a - b)
    for (const bucket of bucketKeys) {
      const count = domPatchBuckets[bucket]!
      domActivity.push({
        window: `${bucket}-${bucket + 1}s`,
        patchCount: count,
      })
    }

    return {
      events: limitedEvents,
      ...(domActivity.length > 0 ? { domActivity } : {}),
      ...(hasMore ? { hasMore: true } : {}),
      _tokenEstimate:
        Math.ceil(JSON.stringify(limitedEvents).length / 4) +
        (domActivity.length > 0
          ? Math.ceil(JSON.stringify(domActivity).length / 4)
          : 0) +
        10,
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
