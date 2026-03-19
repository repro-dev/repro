import {
  LogLevel,
  MessagePartType,
  NetworkMessageType,
  RequestType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box, List } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { RecordingDataAccessor } from '../types'
import { executeTool, tools } from './tools'

function makeAccessor(
  events: List<SourceEventView>,
  duration?: number
): RecordingDataAccessor {
  return {
    getSourceEvents: () => events,
    getDuration: () => duration ?? 0,
  }
}

function makeEmptyAccessor(): RecordingDataAccessor {
  return makeAccessor(new List(SourceEventView, []))
}

function makeFetchRequestEvent(
  time: number,
  correlationId: string,
  url: string,
  method: string,
  headers?: Record<string, string>
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.FetchRequest,
        correlationId,
        requestType: RequestType.Fetch,
        url,
        method,
        headers: headers ?? {},
        body: new ArrayBuffer(0),
      }),
    })
  )
}

function makeFetchResponseEvent(
  time: number,
  correlationId: string,
  status: number,
  headers?: Record<string, string>
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.FetchResponse,
        correlationId,
        status,
        headers: headers ?? {},
        body: new ArrayBuffer(0),
      }),
    })
  )
}

function makeWebSocketOpenEvent(
  time: number,
  correlationId: string,
  url: string
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.WebSocketOpen,
        correlationId,
        url,
      }),
    })
  )
}

function makeWebSocketCloseEvent(
  time: number,
  correlationId: string
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.WebSocketClose,
        correlationId,
      }),
    })
  )
}

describe('tools', () => {
  it('exports an array of tool definitions', () => {
    assert.ok(Array.isArray(tools))
    assert.ok(tools.length > 0)
  })

  it('includes getRecordingDuration tool definition', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name ===
        'getRecordingDuration'
    )
    assert.ok(def !== undefined)
  })

  it('includes getConsoleMessages tool definition', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name ===
        'getConsoleMessages'
    )
    assert.ok(def !== undefined)
  })

  it('includes getNetworkRequests tool definition', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name ===
        'getNetworkRequests'
    )
    assert.ok(def !== undefined)
  })
})

describe('executeTool — unknown tool', () => {
  it('returns error for an unknown tool name', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'doesNotExist', {}) as {
      error: string
    }
    assert.deepStrictEqual(result, { error: 'Unknown tool: doesNotExist' })
  })
})

describe('executeTool — getRecordingDuration', () => {
  it('returns duration from getDuration()', () => {
    const accessor = makeAccessor(new List(SourceEventView, []), 9876)
    const result = executeTool(accessor, 'getRecordingDuration', {}) as {
      durationMs: number
    }
    assert.strictEqual(result.durationMs, 9876)
  })
})

describe('executeTool — getConsoleMessages (stub)', () => {
  it('returns empty messages array', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: unknown[]
    }
    assert.deepStrictEqual(result, { messages: [] })
  })
})

describe('executeTool — getNetworkRequests', () => {
  it('returns empty requests array for empty event list', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      requests: unknown[]
    }
    assert.deepStrictEqual(result, { requests: [] })
  })

  it('returns fetch request with basic fields', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEvent(200, 'req1', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      requests: Array<{
        timeMs: number
        type: string
        method: string
        url: string
        status: number
        responseTimeMs: number
        durationMs: number
      }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.type, 'fetch')
    assert.strictEqual(result.requests[0]!.method, 'GET')
    assert.strictEqual(result.requests[0]!.url, 'https://example.com/api')
    assert.strictEqual(result.requests[0]!.status, 200)
    assert.strictEqual(result.requests[0]!.timeMs, 100)
    assert.strictEqual(result.requests[0]!.responseTimeMs, 200)
    assert.strictEqual(result.requests[0]!.durationMs, 100)
  })

  it('returns fetch request without response when no response event exists', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'POST'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      requests: Array<{
        type: string
        status: number | undefined
        durationMs: number | undefined
      }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.status, undefined)
    assert.strictEqual(result.requests[0]!.durationMs, undefined)
  })

  it('returns websocket request with basic fields', () => {
    const events = new List(SourceEventView, [
      makeWebSocketOpenEvent(50, 'ws1', 'wss://example.com/socket'),
      makeWebSocketCloseEvent(550, 'ws1'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      requests: Array<{
        timeMs: number
        type: string
        url: string
        durationMs: number
      }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.type, 'ws')
    assert.strictEqual(result.requests[0]!.url, 'wss://example.com/socket')
    assert.strictEqual(result.requests[0]!.timeMs, 50)
    assert.strictEqual(result.requests[0]!.durationMs, 500)
  })

  it('returns websocket without durationMs when no close event', () => {
    const events = new List(SourceEventView, [
      makeWebSocketOpenEvent(50, 'ws1', 'wss://example.com/socket'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      requests: Array<{ durationMs: number | undefined }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.durationMs, undefined)
  })

  it('filters by statusMin', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/ok', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(200, 'req2', 'https://example.com/notfound', 'GET'),
      makeFetchResponseEvent(250, 'req2', 404),
      makeFetchRequestEvent(300, 'req3', 'https://example.com/error', 'GET'),
      makeFetchResponseEvent(350, 'req3', 500),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      statusMin: 400,
    }) as {
      requests: Array<{ status: number }>
    }
    assert.strictEqual(result.requests.length, 2)
    assert.strictEqual(result.requests[0]!.status, 404)
    assert.strictEqual(result.requests[1]!.status, 500)
  })

  it('filters by statusMax', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/ok', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(200, 'req2', 'https://example.com/redir', 'GET'),
      makeFetchResponseEvent(250, 'req2', 301),
      makeFetchRequestEvent(300, 'req3', 'https://example.com/error', 'GET'),
      makeFetchResponseEvent(350, 'req3', 500),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      statusMax: 399,
    }) as {
      requests: Array<{ status: number }>
    }
    assert.strictEqual(result.requests.length, 2)
    assert.strictEqual(result.requests[0]!.status, 200)
    assert.strictEqual(result.requests[1]!.status, 301)
  })

  it('filters by both statusMin and statusMax', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/ok', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(200, 'req2', 'https://example.com/notfound', 'GET'),
      makeFetchResponseEvent(250, 'req2', 404),
      makeFetchRequestEvent(300, 'req3', 'https://example.com/error', 'GET'),
      makeFetchResponseEvent(350, 'req3', 500),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      statusMin: 400,
      statusMax: 499,
    }) as {
      requests: Array<{ status: number }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.status, 404)
  })

  it('excludes fetch requests with no response when statusMin is set', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/pending', 'GET'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      statusMin: 400,
    }) as {
      requests: unknown[]
    }
    assert.strictEqual(result.requests.length, 0)
  })

  it('filters by method (case-insensitive)', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/1', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(200, 'req2', 'https://example.com/2', 'POST'),
      makeFetchResponseEvent(250, 'req2', 201),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      method: 'post',
    }) as {
      requests: Array<{ method: string }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.method, 'POST')
  })

  it('filters by urlPattern substring match', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(
        100,
        'req1',
        'https://example.com/users/123',
        'GET'
      ),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(
        200,
        'req2',
        'https://example.com/products/456',
        'GET'
      ),
      makeFetchResponseEvent(250, 'req2', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      urlPattern: '/users/',
    }) as {
      requests: Array<{ url: string }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.url, 'https://example.com/users/123')
  })

  it('filters fetch requests by timeRangeStartMs', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/early', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(500, 'req2', 'https://example.com/late', 'GET'),
      makeFetchResponseEvent(550, 'req2', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      timeRangeStartMs: 400,
    }) as {
      requests: Array<{ url: string }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.url, 'https://example.com/late')
  })

  it('filters fetch requests by timeRangeEndMs', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/early', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(900, 'req2', 'https://example.com/late', 'GET'),
      makeFetchResponseEvent(950, 'req2', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      timeRangeEndMs: 500,
    }) as {
      requests: Array<{ url: string }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.url, 'https://example.com/early')
  })

  it('filters websocket requests by urlPattern', () => {
    const events = new List(SourceEventView, [
      makeWebSocketOpenEvent(50, 'ws1', 'wss://example.com/chat'),
      makeWebSocketOpenEvent(100, 'ws2', 'wss://example.com/notifications'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      urlPattern: '/chat',
    }) as {
      requests: Array<{ url: string }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.url, 'wss://example.com/chat')
  })

  it('excludes websocket requests when statusMin is set', () => {
    const events = new List(SourceEventView, [
      makeWebSocketOpenEvent(50, 'ws1', 'wss://example.com/socket'),
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEvent(150, 'req1', 500),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      statusMin: 400,
    }) as {
      requests: Array<{ type: string }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.type, 'fetch')
  })

  it('excludes websocket requests when method is set', () => {
    const events = new List(SourceEventView, [
      makeWebSocketOpenEvent(50, 'ws1', 'wss://example.com/socket'),
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      method: 'GET',
    }) as {
      requests: Array<{ type: string }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.type, 'fetch')
  })

  it('filters websocket requests by timeRangeStartMs', () => {
    const events = new List(SourceEventView, [
      makeWebSocketOpenEvent(100, 'ws1', 'wss://example.com/early'),
      makeWebSocketOpenEvent(800, 'ws2', 'wss://example.com/late'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      timeRangeStartMs: 500,
    }) as {
      requests: Array<{ url: string }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.url, 'wss://example.com/late')
  })

  it('returns both fetch and websocket requests when no filters applied', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeWebSocketOpenEvent(200, 'ws1', 'wss://example.com/socket'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      requests: Array<{ type: string }>
    }
    assert.strictEqual(result.requests.length, 2)
    assert.strictEqual(result.requests[0]!.type, 'fetch')
    assert.strictEqual(result.requests[1]!.type, 'ws')
  })

  it('includes request and response headers for fetch', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET', {
        'x-request-header': 'req-value',
      }),
      makeFetchResponseEvent(200, 'req1', 200, {
        'content-type': 'application/json',
      }),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      requests: Array<{
        requestHeaders: Record<string, string>
        responseHeaders: Record<string, string>
      }>
    }
    assert.deepStrictEqual(result.requests[0]!.requestHeaders, {
      'x-request-header': 'req-value',
    })
    assert.deepStrictEqual(result.requests[0]!.responseHeaders, {
      'content-type': 'application/json',
    })
  })
})

function makeConsoleErrorEvent(
  time: number,
  message: string,
  stack?: Array<{
    functionName?: string
    fileName: string
    lineNumber: number
    columnNumber: number
  }>
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Console,
      time,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: message,
          }),
        ],
        stack: (stack ?? []).map(s => ({
          functionName: s.functionName ?? null,
          fileName: s.fileName,
          lineNumber: s.lineNumber,
          columnNumber: s.columnNumber,
        })),
      },
    })
  )
}

function makeConsoleInfoEvent(
  time: number,
  message: string
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Console,
      time,
      data: {
        level: LogLevel.Info,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: message,
          }),
        ],
        stack: [],
      },
    })
  )
}

describe('tools — findErrors definition', () => {
  it('includes findErrors tool definition', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name === 'findErrors'
    )
    assert.ok(def !== undefined)
  })
})

describe('executeTool — findErrors', () => {
  it('returns empty errors for recording with no errors', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: unknown[]
      summary: { console: number; network: number; total: number }
    }
    assert.deepStrictEqual(result.errors, [])
    assert.deepStrictEqual(result.summary, { console: 0, network: 0, total: 0 })
  })

  it('finds console errors', () => {
    const events = new List(SourceEventView, [
      makeConsoleErrorEvent(500, 'TypeError: Cannot read property x'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: Array<{ time: number; source: string; summary: string }>
      summary: { console: number; network: number; total: number }
    }
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0]!.source, 'console')
    assert.strictEqual(result.errors[0]!.time, 500)
    assert.ok(result.errors[0]!.summary.includes('TypeError'))
    assert.strictEqual(result.summary.console, 1)
    assert.strictEqual(result.summary.total, 1)
  })

  it('excludes non-error console messages', () => {
    const events = new List(SourceEventView, [
      makeConsoleInfoEvent(100, 'debug info'),
      makeConsoleErrorEvent(200, 'real error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: Array<{ source: string }>
    }
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0]!.source, 'console')
  })

  it('finds network errors (status >= 400)', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api/users', 'GET'),
      makeFetchResponseEvent(200, 'req1', 500),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: Array<{ time: number; source: string; summary: string }>
      summary: { network: number }
    }
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0]!.source, 'network')
    assert.ok(result.errors[0]!.summary.includes('500'))
    assert.ok(result.errors[0]!.summary.includes('GET'))
    assert.strictEqual(result.summary.network, 1)
  })

  it('excludes successful network requests', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/ok', 'GET'),
      makeFetchResponseEvent(200, 'req1', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: unknown[]
    }
    assert.strictEqual(result.errors.length, 0)
  })

  it('combines and sorts console and network errors chronologically', () => {
    const events = new List(SourceEventView, [
      makeConsoleErrorEvent(300, 'Error after request'),
      makeFetchRequestEvent(100, 'req1', 'https://example.com/fail', 'POST'),
      makeFetchResponseEvent(200, 'req1', 500),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: Array<{ time: number; source: string }>
    }
    assert.strictEqual(result.errors.length, 2)
    assert.strictEqual(result.errors[0]!.source, 'network')
    assert.strictEqual(result.errors[0]!.time, 100)
    assert.strictEqual(result.errors[1]!.source, 'console')
    assert.strictEqual(result.errors[1]!.time, 300)
  })

  it('filters by time range', () => {
    const events = new List(SourceEventView, [
      makeConsoleErrorEvent(100, 'early error'),
      makeConsoleErrorEvent(500, 'mid error'),
      makeConsoleErrorEvent(900, 'late error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {
      timeRangeStartMs: 200,
      timeRangeEndMs: 600,
    }) as {
      errors: Array<{ time: number }>
    }
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0]!.time, 500)
  })

  it('includes stack traces from console errors as basename:line:col', () => {
    const events = new List(SourceEventView, [
      makeConsoleErrorEvent(100, 'TypeError', [
        {
          functionName: 'render',
          fileName: 'https://cdn.example.com/static/js/ProductList.abc123.js',
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          functionName: 'processChild',
          fileName: 'https://cdn.example.com/static/js/react-dom.prod.js',
          lineNumber: 1234,
          columnNumber: 5,
        },
      ]),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: Array<{ stack?: string[] }>
    }
    assert.ok(result.errors[0]!.stack)
    assert.strictEqual(result.errors[0]!.stack!.length, 2)
    assert.strictEqual(result.errors[0]!.stack![0], 'ProductList.abc123.js:42:10')
    assert.strictEqual(result.errors[0]!.stack![1], 'react-dom.prod.js:1234:5')
  })

  it('limits stack traces to 3 frames', () => {
    const frames = Array.from({ length: 5 }, (_, i) => ({
      functionName: `fn${i}`,
      fileName: `file${i}.js`,
      lineNumber: i + 1,
      columnNumber: 0,
    }))
    const events = new List(SourceEventView, [
      makeConsoleErrorEvent(100, 'Error', frames),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: Array<{ stack?: string[] }>
    }
    assert.strictEqual(result.errors[0]!.stack!.length, 3)
  })

  it('truncates long console error messages to 200 chars', () => {
    const longMessage = 'x'.repeat(300)
    const events = new List(SourceEventView, [
      makeConsoleErrorEvent(100, longMessage),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: Array<{ summary: string }>
    }
    assert.ok(result.errors[0]!.summary.length <= 201)
    assert.ok(result.errors[0]!.summary.endsWith('…'))
  })

  it('uses pathname in network error summary', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(
        100,
        'req1',
        'https://api.example.com/v2/users?page=1',
        'DELETE'
      ),
      makeFetchResponseEvent(200, 'req1', 403),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'findErrors', {}) as {
      errors: Array<{ summary: string }>
    }
    assert.ok(result.errors[0]!.summary.includes('/v2/users'))
    assert.ok(result.errors[0]!.summary.includes('DELETE'))
    assert.ok(result.errors[0]!.summary.includes('403'))
  })
})
