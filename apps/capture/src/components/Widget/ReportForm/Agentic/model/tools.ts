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
import { buildA11yTree, formatA11yTree } from '@repro/vdom-utils'
import { RecordingDataAccessor } from '../types'
import {
  DetailLevel,
  estimateTokens,
  shortenStackFrame,
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

const FIND_ERRORS = {
  type: 'function',
  function: {
    name: 'findErrors',
    description:
      'Find all errors in the recording — console errors and failed network requests — sorted chronologically. Use this as the first tool to understand what went wrong.',
    parameters: {
      type: 'object',
      properties: {
        timeRangeStartMs: {
          type: 'number',
          description:
            'Start of time range in ms from recording start. If omitted, defaults to recording start.',
        },
        timeRangeEndMs: {
          type: 'number',
          description:
            'End of time range in ms from recording start. If omitted, defaults to recording end.',
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
  GET_DOM_STATE,
  FIND_ERRORS,
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
    const detail = (args.detail as DetailLevel) ?? 'normal'
    const logLevelStr = (args.logLevel as string) ?? 'info'
    const timeStart = args.timeRangeStartMs as number | undefined
    const timeEnd = args.timeRangeEndMs as number | undefined

    const userMinLevel = LOG_LEVEL_MAP[logLevelStr] ?? LogLevel.Info

    let tierMinLevel = userMinLevel
    if (detail === 'summary') {
      tierMinLevel = Math.max(userMinLevel, LogLevel.Error)
    } else if (detail === 'normal') {
      tierMinLevel = Math.max(userMinLevel, LogLevel.Warning)
    }

    const TEXT_MAX: Record<DetailLevel, number> = {
      summary: 100,
      normal: 200,
      full: 500,
    }
    const STACK_MAX: Record<DetailLevel, number> = {
      summary: 0,
      normal: 3,
      full: 10,
    }

    const levelSummary = { verbose: 0, info: 0, warning: 0, error: 0 }

    type CollectedMessage = {
      timeMs: number
      levelName: string
      text: string
      stack: string[]
    }

    const collected: CollectedMessage[] = []

    for (let i = 0, len = events.size(); i < len; i++) {
      const event = events.over(i)
      if (!event) continue
      if (!isConsoleEvent(event)) continue

      const consoleEvent: Box<ConsoleEvent> = event

      const time = consoleEvent.get('time').orElse(0)
      if (timeStart !== undefined && time < timeStart) continue
      if (timeEnd !== undefined && time > timeEnd) continue

      const level = consoleEvent.get('data').get('level').orElse(LogLevel.Info)
      if (level < userMinLevel) continue

      const levelName = LOG_LEVEL_NAMES[level] ?? 'info'
      if (levelName === 'verbose') levelSummary.verbose++
      else if (levelName === 'info') levelSummary.info++
      else if (levelName === 'warning') levelSummary.warning++
      else if (levelName === 'error') levelSummary.error++

      if (level < tierMinLevel) continue

      const parts = consoleEvent.get('data').get('parts').orElse([])
      const rawText = parts.map(serializeMessagePart).join(' ')
      const text = truncate(rawText, TEXT_MAX[detail])

      const stackEntries = consoleEvent.get('data').get('stack').orElse([])
      const maxFrames = STACK_MAX[detail]
      const stack =
        maxFrames === 0
          ? []
          : stackEntries.slice(0, maxFrames).map(entry =>
              shortenStackFrame(
                `${entry.fileName}:${entry.lineNumber}:${entry.columnNumber}`
              )
            )

      collected.push({ timeMs: time, levelName, text, stack })
    }

    type OutputMessage = {
      timeMs: number
      level: string
      text: string
      stack?: string[]
      count?: number
    }

    let messages: OutputMessage[]

    if (detail === 'full') {
      messages = collected.map(m => {
        const msg: OutputMessage = {
          timeMs: m.timeMs,
          level: m.levelName,
          text: m.text,
        }
        if (m.stack.length > 0) msg.stack = m.stack
        return msg
      })
    } else {
      const dedupMap = new Map<string, OutputMessage>()
      for (const m of collected) {
        const existing = dedupMap.get(m.text)
        if (existing) {
          existing.count = (existing.count ?? 1) + 1
        } else {
          const msg: OutputMessage = {
            timeMs: m.timeMs,
            level: m.levelName,
            text: m.text,
            count: 1,
          }
          if (m.stack.length > 0) msg.stack = m.stack
          dedupMap.set(m.text, msg)
        }
      }
      messages = Array.from(dedupMap.values())
      if (detail === 'summary') {
        messages = messages.slice(0, 3)
      }
    }

    const response = {
      messages,
      summary: levelSummary,
    }
    return { ...response, _tokenEstimate: estimateTokens(response) }
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

  findErrors: (recording, args) => {
    const events = recording.getSourceEvents()
    const timeStart = args.timeRangeStartMs as number | undefined
    const timeEnd = args.timeRangeEndMs as number | undefined

    const errors: Array<{
      time: number
      source: 'console' | 'network'
      summary: string
      stack?: string[]
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
      if (level !== LogLevel.Error) continue

      const parts = consoleEvent.get('data').get('parts').orElse([])
      const text = parts.map(serializeMessagePart).join(' ')
      const summary = text.length > 200 ? text.slice(0, 200) + '…' : text

      const stackEntries = consoleEvent.get('data').get('stack').orElse([])
      const stack = stackEntries.slice(0, 3).map(entry => {
        const fileName = entry.fileName
        const basename = fileName.split('/').pop() ?? fileName
        return `${basename}:${entry.lineNumber}:${entry.columnNumber}`
      })

      errors.push({
        time,
        source: 'console',
        summary,
        ...(stack.length > 0 ? { stack } : {}),
      })
    }

    const indexed = findIndexedNetworkEvents(events)
    const groups = groupNetworkEvents(indexed)

    for (const group of groups) {
      if (group.type !== 'fetch') continue
      if (!group.response || group.response.status < 400) continue

      const time = group.requestTime
      if (timeStart !== undefined && time < timeStart) continue
      if (timeEnd !== undefined && time > timeEnd) continue

      let pathname: string
      try {
        pathname = new URL(group.request.url).pathname
      } catch {
        pathname = group.request.url
      }

      errors.push({
        time,
        source: 'network',
        summary: `${group.request.method} ${pathname} → ${group.response.status}`,
      })
    }

    errors.sort((a, b) => a.time - b.time)

    const consoleCount = errors.filter(e => e.source === 'console').length
    const networkCount = errors.filter(e => e.source === 'network').length

    return {
      errors,
      summary: {
        console: consoleCount,
        network: networkCount,
        total: consoleCount + networkCount,
      },
    }
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
