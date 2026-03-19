import {
  ConsoleEvent,
  DateMessagePart,
  LogLevel,
  MessagePartType,
  NodeType,
  SourceEvent,
  SourceEventType,
  SyntheticId,
  VElement,
  VTree,
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

const GET_ELEMENT_DETAILS = {
  type: 'function',
  function: {
    name: 'getElementDetails',
    description:
      'Get detailed information about a specific DOM element by its node ID. Use this to inspect attributes, styles, classes, parent context, and siblings of an element identified from getDOMState output.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description:
            'The node ID to inspect (from [ref=<nodeId>] in getDOMState output).',
        },
        timestampMs: {
          type: 'number',
          description:
            'Point in time (ms from recording start) to reconstruct DOM state for.',
        },
        context: {
          type: 'string',
          enum: ['self', 'subtree', 'ancestry'],
          default: 'self',
          description:
            'Level of context: "self" (element + 3 ancestors + adjacent siblings), "subtree" (adds direct children), "ancestry" (full parent chain to root).',
        },
      },
      required: ['nodeId', 'timestampMs'],
    },
  },
}

export const tools = [
  GET_RECORDING_DURATION,
  GET_CONSOLE_MESSAGES,
  GET_NETWORK_REQUESTS,
  GET_ELEMENT_DETAILS,
]

function getVNodeById(vtree: VTree, nodeId: SyntheticId): VElement | null {
  const node = vtree.nodes[nodeId]
  if (!node) return null
  if (!node.match(n => n.type === NodeType.Element)) return null
  let result: VElement | null = null
  node.apply(n => {
    if (n.type === NodeType.Element) {
      result = n
    }
  })
  return result
}

function getParentChain(
  vtree: VTree,
  startId: SyntheticId | null | undefined,
  maxDepth: number
): Array<{
  nodeId: string
  tagName: string
  attributes: Record<string, string>
}> {
  const parents: Array<{
    nodeId: string
    tagName: string
    attributes: Record<string, string>
  }> = []
  let currentId = startId
  let depth = 0
  while (currentId && depth < maxDepth) {
    const node = vtree.nodes[currentId]
    if (!node) break
    let pushed = false
    node.apply(n => {
      if (n.type === NodeType.Element) {
        const attrs: Record<string, string> = {}
        for (const [k, v] of Object.entries(n.attributes)) {
          if (v != null) attrs[k] = v
        }
        parents.push({ nodeId: n.id, tagName: n.tagName, attributes: attrs })
        pushed = true
      }
    })
    if (!pushed) break
    node.apply(n => {
      currentId = n.parentId ?? null
    })
    depth++
  }
  return parents
}

function getAdjacentSiblings(
  vtree: VTree,
  parentId: SyntheticId | null | undefined,
  nodeId: SyntheticId
): Array<{
  nodeId: string
  tagName: string
  attributes: Record<string, string>
}> {
  if (!parentId) return []
  const parentNode = vtree.nodes[parentId]
  if (!parentNode) return []
  const siblings: Array<{
    nodeId: string
    tagName: string
    attributes: Record<string, string>
  }> = []
  parentNode.apply(p => {
    if (!('children' in p)) return
    const idx = p.children.indexOf(nodeId)
    if (idx === -1) return
    const adjacentIds: SyntheticId[] = []
    if (idx > 0 && p.children[idx - 1]) adjacentIds.push(p.children[idx - 1]!)
    if (idx < p.children.length - 1 && p.children[idx + 1])
      adjacentIds.push(p.children[idx + 1]!)
    for (const sibId of adjacentIds) {
      const sibNode = vtree.nodes[sibId]
      if (!sibNode) continue
      sibNode.apply(s => {
        if (s.type === NodeType.Element) {
          const attrs: Record<string, string> = {}
          const limitedKeys = ['class', 'id', 'style']
          for (const key of limitedKeys) {
            if (s.attributes[key] != null) attrs[key] = s.attributes[key]!
          }
          siblings.push({ nodeId: s.id, tagName: s.tagName, attributes: attrs })
        }
      })
    }
  })
  return siblings
}

function getDirectChildren(
  vtree: VTree,
  childIds: SyntheticId[]
): Array<{
  nodeId: string
  tagName: string
  attributes: Record<string, string>
}> {
  const children: Array<{
    nodeId: string
    tagName: string
    attributes: Record<string, string>
  }> = []
  for (const childId of childIds) {
    const childNode = vtree.nodes[childId]
    if (!childNode) continue
    childNode.apply(c => {
      if (c.type === NodeType.Element) {
        const attrs: Record<string, string> = {}
        for (const [k, v] of Object.entries(c.attributes)) {
          if (v != null) attrs[k] = v
        }
        children.push({ nodeId: c.id, tagName: c.tagName, attributes: attrs })
      }
    })
  }
  return children
}

function collectTextContent(
  vtree: VTree,
  childIds: SyntheticId[],
  maxLength: number
): string {
  let text = ''
  for (const childId of childIds) {
    if (text.length >= maxLength) break
    const childNode = vtree.nodes[childId]
    if (!childNode) continue
    childNode.apply(c => {
      if (c.type === NodeType.Text) {
        text += c.value
      } else if (c.type === NodeType.Element && 'children' in c) {
        text += collectTextContent(vtree, c.children, maxLength - text.length)
      }
    })
  }
  return text.slice(0, maxLength)
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

  getElementDetails: (recording, args) => {
    const nodeId = args.nodeId as string | undefined
    const timestampMs = args.timestampMs as number | undefined
    const context = (args.context as string) ?? 'self'

    if (!nodeId) {
      return { error: 'nodeId parameter is required' }
    }
    if (timestampMs === undefined) {
      return { error: 'timestampMs parameter is required' }
    }

    const snapshot = recording.getSnapshotAtTime(timestampMs)
    if (!snapshot || !snapshot.dom) {
      return { error: 'No DOM snapshot available at the specified time' }
    }

    const vtree = snapshot.dom
    const element = getVNodeById(vtree, nodeId as SyntheticId)
    if (!element) {
      return { error: `Element with nodeId "${nodeId}" not found` }
    }

    const attrs: Record<string, string> = {}
    for (const [k, v] of Object.entries(element.attributes)) {
      if (v != null) attrs[k] = v
    }

    const properties: Record<string, unknown> = {}
    if (element.properties.value != null)
      properties.value = element.properties.value
    if (element.properties.checked != null)
      properties.checked = element.properties.checked
    if (element.properties.selectedIndex != null)
      properties.selectedIndex = element.properties.selectedIndex

    const maxParents = context === 'ancestry' ? 50 : 3
    const parents = getParentChain(vtree, element.parentId, maxParents)
    const siblings = getAdjacentSiblings(
      vtree,
      element.parentId,
      nodeId as SyntheticId
    )

    const result: Record<string, unknown> = {
      element: {
        nodeId: element.id,
        tagName: element.tagName,
        attributes: attrs,
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
      },
      parents,
      siblings,
    }

    if (context === 'subtree') {
      result.children = getDirectChildren(vtree, element.children)
    }

    const textContent = collectTextContent(vtree, element.children, 200)
    if (textContent.length > 0) {
      result.textContent = textContent
    }

    return result
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
