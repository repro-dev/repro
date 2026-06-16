import {
  ConsoleEvent,
  InteractionEvent,
  InteractionType,
  LogLevel,
  NetworkEvent,
  PageTransition,
  PatchType,
  PerformanceEntryType,
  PerformanceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { groupNetworkEvents } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { chain, type FutureInstance, parallel, resolve } from 'fluture'
import { estimateTokens } from '../token-optimization'
import type { ToolHandler } from './common'
import {
  createError,
  isConsoleEvent,
  isDOMPatchEvent,
  isInteractionEvent,
  serializeMessagePart,
} from './common'

// Headers that may carry auth tokens, session cookies, or other credentials.
// Values for these keys are excluded from the searchable text.
const SENSITIVE_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
])

const SENSITIVE_RESPONSE_HEADERS = new Set(['set-cookie'])

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'searchEvents',
    description:
      'Search for events containing a specific text string. Performs case-insensitive substring matching across serialized event payloads — console messages, network URLs, interaction labels, DOM changes, and performance entries.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search string (case-insensitive substring match).',
        },
        eventTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional filter to specific event types.',
        },
        timeRangeStartMs: { type: 'number' },
        timeRangeEndMs: { type: 'number' },
        maxResults: {
          type: 'number',
          description: 'Max matches to return (default 20).',
        },
      },
      required: ['query'] as string[],
    },
  },
}

function extractMatchContext(
  text: string,
  query: string,
  contextChars = 40
): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return ''
  const start = Math.max(0, idx - contextChars)
  const end = Math.min(text.length, idx + query.length + contextChars)
  let context = text.slice(start, end)
  if (start > 0) context = '...' + context
  if (end < text.length) context = context + '...'
  return context
}

export const handler: ToolHandler = (recording, args) => {
  const rawQuery = ((args.query as string) ?? '').trim()

  // Reject blank/whitespace-only queries — `includes('')` matches everything.
  if (rawQuery.length === 0) {
    return resolve(
      createError(
        'query must not be blank',
        'An empty or whitespace-only query would match every event, which is not useful',
        'Provide a non-empty search string, e.g. searchEvents({ query: "TypeError" })'
      )
    )
  }

  const query = rawQuery.toLowerCase()
  const eventTypes = args.eventTypes as string[] | undefined
  const timeRangeStartMs = (args.timeRangeStartMs as number) ?? 0
  const timeRangeEndMs =
    (args.timeRangeEndMs as number) ?? Number.MAX_SAFE_INTEGER
  const maxResults = (args.maxResults as number) ?? 20

  const matches: Array<{
    index: number
    timeMs: number
    type: string
    summary: string
    matchContext: string
  }> = []

  let globalIndex = 0

  // Helper: add match if text contains query
  function tryMatch(
    text: string,
    timeMs: number,
    type: string,
    summary: string
  ): void {
    if (!text.toLowerCase().includes(query)) return
    const matchContext = extractMatchContext(text, query)
    matches.push({ index: globalIndex++, timeMs, type, summary, matchContext })
  }

  const shouldIncludeType = (type: string): boolean =>
    !eventTypes || eventTypes.includes(type)

  const opts = {
    startMs: timeRangeStartMs === 0 ? undefined : timeRangeStartMs,
    endMs:
      timeRangeEndMs === Number.MAX_SAFE_INTEGER ? undefined : timeRangeEndMs,
  }

  // Build futures for each event type
  const eventFutures: Array<FutureInstance<Error, unknown>> = []
  if (shouldIncludeType('console'))
    eventFutures.push(
      recording.getEventsByType([SourceEventType.Console], opts)
    )
  if (shouldIncludeType('network'))
    eventFutures.push(
      recording.getEventsByType([SourceEventType.Network], opts)
    )
  if (shouldIncludeType('interaction'))
    eventFutures.push(
      recording.getEventsByType([SourceEventType.Interaction], opts)
    )
  if (shouldIncludeType('domPatch'))
    eventFutures.push(
      recording.getEventsByType([SourceEventType.DOMPatch], opts)
    )
  if (shouldIncludeType('performance'))
    eventFutures.push(
      recording.getEventsByType([SourceEventType.Performance], opts)
    )

  // If no futures were added, return early
  if (eventFutures.length === 0) {
    const empty = { matches: [] }
    return resolve({ ...empty, _tokenEstimate: estimateTokens(empty) })
  }

  return parallel(Infinity)(eventFutures).pipe(
    chain(results => {
      // Unpack results in the order they were pushed
      let idx = 0

      // ─── Console events ──────────────────────────────────────────────────────

      if (shouldIncludeType('console')) {
        const consoleEvents = results[idx++] as Array<
          ReturnType<typeof SourceEventView.from>
        >

        for (const event of consoleEvents) {
          if (!isConsoleEvent(event)) continue
          const consoleEvent = event as Box<ConsoleEvent>
          const timeMs = consoleEvent.get('time').orElse(0)
          if (timeMs < timeRangeStartMs || timeMs > timeRangeEndMs) continue

          // Use .flat() to handle data being a plain object or a double-boxed Box
          const dataBox = consoleEvent.get('data').flat() as Box<{
            level: LogLevel
            parts: Array<Box<{ type: import('@repro/domain').MessagePartType }>>
            stack: Array<{
              functionName: string | null
              fileName: string
              lineNumber: number
              columnNumber: number
            }>
          }>
          const parts = dataBox.get('parts').orElse([])
          const text = parts.map(serializeMessagePart).join(' ')
          const level = dataBox.get('level').orElse(LogLevel.Info)
          const levelName =
            level === LogLevel.Error
              ? 'error'
              : level === LogLevel.Warning
              ? 'warning'
              : 'info'

          const stackEntries = dataBox.get('stack').orElse([])
          const stackFileNames = stackEntries
            .map(entry => entry.fileName.split('/').pop() ?? entry.fileName)
            .join(' ')

          const searchText = [text, stackFileNames].filter(Boolean).join(' ')
          const summary = `[${levelName}] ${text.slice(0, 100)}`

          tryMatch(searchText, timeMs, 'console', summary)
        }
      }

      // ─── Network events ───────────────────────────────────────────────────────

      if (shouldIncludeType('network')) {
        const networkEvents = results[idx++] as Array<
          ReturnType<typeof SourceEventView.from>
        >
        const indexed: Array<[NetworkEvent, number]> = []
        for (const e of networkEvents) {
          ;(e as Box<NetworkEvent>).apply(n => indexed.push([n, 0]))
        }
        const groups = groupNetworkEvents(indexed)

        for (const group of groups) {
          if (group.type !== 'fetch') continue

          const timeMs = group.requestTime
          if (timeMs < timeRangeStartMs || timeMs > timeRangeEndMs) continue

          const url = group.request.url
          const method = group.request.method
          const status = group.response ? String(group.response.status) : ''

          // Build searchable text from request headers (sensitive keys excluded)
          const reqHeaders = Object.entries(group.request.headers ?? {})
            .filter(([k]) => !SENSITIVE_REQUEST_HEADERS.has(k.toLowerCase()))
            .map(([k, v]) => `${k}: ${v}`)
            .join(' ')

          // Build searchable text from response headers (sensitive keys excluded)
          const resHeaders = group.response
            ? Object.entries(group.response.headers ?? {})
                .filter(
                  ([k]) => !SENSITIVE_RESPONSE_HEADERS.has(k.toLowerCase())
                )
                .map(([k, v]) => `${k}: ${v}`)
                .join(' ')
            : ''

          const searchText = [method, url, status, reqHeaders, resHeaders]
            .filter(Boolean)
            .join(' ')

          const displayUrl = url.slice(-50)
          const summary = `${method} ${displayUrl}${
            status ? ` → ${status}` : ''
          }`

          tryMatch(searchText, timeMs, 'network', summary)
        }
      }

      // ─── Interaction events ───────────────────────────────────────────────────────

      if (shouldIncludeType('interaction')) {
        const interactionEvents = results[idx++] as Array<
          ReturnType<typeof SourceEventView.from>
        >

        for (const event of interactionEvents) {
          if (!isInteractionEvent(event)) continue
          const interactionEvent = event as Box<InteractionEvent>
          const timeMs = interactionEvent.get('time').orElse(0)
          if (timeMs < timeRangeStartMs || timeMs > timeRangeEndMs) continue

          const interaction = interactionEvent.get('data').flat() as Box<{
            type: InteractionType
            meta?: { humanReadableLabel?: string | null }
            from?: string | null
            to?: string
          }>
          const interactionType = interaction
            .get('type')
            .orElse(-1 as InteractionType)

          // Skip low-signal events (same list as get-events-around-time.ts)
          if (
            interactionType === InteractionType.PointerMove ||
            interactionType === InteractionType.PointerDown ||
            interactionType === InteractionType.PointerUp ||
            interactionType === InteractionType.KeyUp
          ) {
            continue
          }

          const searchParts: string[] = []
          let summary = 'interaction'

          if (
            interactionType === InteractionType.Click ||
            interactionType === InteractionType.DoubleClick
          ) {
            const label = interaction
              .map(
                d =>
                  (d as { meta?: { humanReadableLabel?: string | null } }).meta
                    ?.humanReadableLabel ?? null
              )
              .orElse(null)
            if (label) {
              searchParts.push(label)
              summary = `click: ${label.slice(0, 80)}`
            }
          } else if (interactionType === InteractionType.PageTransition) {
            const pageEvent = interaction as Box<PageTransition>
            const from = pageEvent.get('from').orElse(null)
            const to = pageEvent.get('to').orElse('')
            if (from) searchParts.push(from)
            if (to) searchParts.push(to)
            summary = `pageTransition → ${to.slice(0, 80)}`
          } else if (interactionType === InteractionType.KeyDown) {
            const key = (interaction as Box<{ key?: string }>)
              .get('key')
              .orElse('')
            if (key) searchParts.push(key)
            summary = `keyDown: ${key}`
          } else if (interactionType === InteractionType.Scroll) {
            summary = 'scroll'
            searchParts.push('scroll')
          } else if (interactionType === InteractionType.ViewportResize) {
            summary = 'viewportResize'
            searchParts.push('viewportResize')
          }

          if (searchParts.length === 0) continue
          const searchText = searchParts.join(' ')
          tryMatch(searchText, timeMs, 'interaction', summary)
        }
      }

      // ─── DOM Patch events ─────────────────────────────────────────────────────────

      if (shouldIncludeType('domPatch')) {
        const patchEvents = results[idx++] as Array<
          ReturnType<typeof SourceEventView.from>
        >

        for (const event of patchEvents) {
          if (!isDOMPatchEvent(event)) continue

          const timeMs = event.get('time').orElse(0)
          if (timeMs < timeRangeStartMs || timeMs > timeRangeEndMs) continue

          // Double-Box unwrap — DOMPatchEvent.data is double-wrapped after codec
          const eventBox = event as Box<{
            type: number
            time: number
            data: Box<{ type: PatchType }>
          }>
          const dataBox = eventBox.get('data').flat() as Box<{
            type: PatchType
            name?: string
            value?: string | null
            oldValue?: string | null
          }>

          const patchType = dataBox.get('type').orElse(-1 as PatchType)

          let searchText = ''
          let summary = 'domPatch'

          if (patchType === PatchType.Attribute) {
            const name = dataBox.get('name').orElse('')
            const value = dataBox.get('value').orElse(null) ?? ''
            const oldValue = dataBox.get('oldValue').orElse(null) ?? ''
            searchText = `attr ${name} ${value} ${oldValue}`
            summary = `attr ${name}=${value}`
          } else if (patchType === PatchType.Text) {
            const value = dataBox.get('value').orElse(null) ?? ''
            const oldValue = dataBox.get('oldValue').orElse(null) ?? ''
            searchText = `text ${value} ${oldValue}`
            summary = `text: ${value.slice(0, 80)}`
          } else if (
            patchType === PatchType.TextProperty ||
            patchType === PatchType.BooleanProperty ||
            patchType === PatchType.NumberProperty
          ) {
            const name = dataBox.get('name').orElse('')
            const value = dataBox.get('value').orElse(null) ?? ''
            searchText = `prop ${name} ${value}`
            summary = `prop ${name}=${value}`
          }

          if (!searchText) continue
          tryMatch(searchText, timeMs, 'domPatch', summary)
        }
      }

      // ─── Performance events ───────────────────────────────────────────────────────

      if (shouldIncludeType('performance')) {
        const performanceEvents = results[idx++] as Array<
          ReturnType<typeof SourceEventView.from>
        >

        for (const event of performanceEvents) {
          const timeMs = event.get('time').orElse(0)
          if (timeMs < timeRangeStartMs || timeMs > timeRangeEndMs) continue

          const perfEvent = event as Box<PerformanceEvent>
          const dataBox = perfEvent.get('data').flat() as Box<{
            type: PerformanceEntryType
            url?: string
            initiatorType?: string
          }>

          const entryType = dataBox
            .get('type')
            .orElse(-1 as PerformanceEntryType)
          if (entryType !== PerformanceEntryType.ResourceTiming) continue

          const url = dataBox.get('url').orElse('') ?? ''
          const initiatorType = dataBox.get('initiatorType').orElse('') ?? ''
          const searchText = [url, initiatorType].filter(Boolean).join(' ')

          if (!searchText) continue
          const summary = `${initiatorType} ${url.slice(-60)}`
          tryMatch(searchText, timeMs, 'performance', summary)
        }
      }

      matches.sort((a, b) => a.timeMs - b.timeMs)

      // Re-assign indices after sorting
      matches.forEach((m, i) => {
        m.index = i
      })

      const result = { matches: matches.slice(0, maxResults) }
      return resolve({ ...result, _tokenEstimate: estimateTokens(result) })
    })
  )
}
