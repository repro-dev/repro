import {
  NetworkEvent,
  NetworkMessageType,
  SourceEventType,
  WebSocketMessageType,
} from '@repro/domain'
import { groupNetworkEvents } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { resolve } from 'fluture'
import {
  DetailLevel,
  estimateTokens,
  shortenUrl,
  truncate,
} from '../token-optimization'
import type { ToolHandler } from './common'

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

export const TOOL_DEFINITION = {
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

export const handler: ToolHandler = (recording, args) => {
  const events = recording.getEventsByType([SourceEventType.Network])
  const indexed: Array<[NetworkEvent, number]> = []
  for (const e of events) {
    // Use a dummy index here because this path only groups network events; replay indices are not needed.
    ;(e as Box<NetworkEvent>).apply(n => indexed.push([n, 0]))
  }
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
        group.responseTime !== undefined ? group.responseTime - time : undefined

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
        const filteredHeaders = filterHeaders(group.response?.headers ?? {})
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

      const allMessages = group.messages ?? []

      if (detail === 'summary') {
        let inbound = 0
        let outbound = 0
        for (const msg of allMessages) {
          if (msg.data.type === NetworkMessageType.WebSocketInbound) {
            inbound++
          } else {
            outbound++
          }
        }
        requests.push({
          timeMs: time,
          type: 'ws',
          url,
          messageCount: { inbound, outbound },
        })
      } else {
        const msgLimit = detail === 'normal' ? 10 : 100
        const payloadLimit = detail === 'normal' ? 200 : 2000

        const messages = allMessages.slice(0, msgLimit).map(msg => {
          const direction =
            msg.data.type === NetworkMessageType.WebSocketInbound
              ? 'inbound'
              : 'outbound'
          let payload: string
          if (msg.data.messageType === WebSocketMessageType.Binary) {
            payload = `[binary frame, ${
              (msg.data.data as ArrayBuffer).byteLength
            } bytes]`
          } else {
            // Text frames are UTF-8 by the WebSocket spec. Apps that send
            // binary-encoded data (e.g. MessagePack) over text frames will
            // produce garbled output here, but that's an app-level protocol
            // issue we can't resolve without schema knowledge.
            payload = truncate(
              new TextDecoder().decode(msg.data.data as ArrayBuffer),
              payloadLimit
            )
          }
          return { timeMs: msg.time, direction, payload }
        })

        const entry: Record<string, unknown> = {
          timeMs: time,
          type: 'ws',
          url,
          messages,
        }
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

  const hasFilters =
    urlPattern !== undefined ||
    method !== undefined ||
    statusMin !== undefined ||
    statusMax !== undefined

  if (requests.length === 0 && hasFilters) {
    return resolve({
      requests: [],
      summary,
      _hint:
        'No requests matched the provided filters. Call getNetworkRequests() without filters to see all available network requests.',
      _tokenEstimate: estimateTokens({ requests: [], summary }),
    })
  }

  const result = { requests, summary }
  return resolve({ ...result, _tokenEstimate: estimateTokens(result) })
}
