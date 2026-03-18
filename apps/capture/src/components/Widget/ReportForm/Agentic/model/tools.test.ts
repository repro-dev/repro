import {
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
      makeFetchRequestEvent(100, 'req1', 'https://example.com/users/123', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(200, 'req2', 'https://example.com/products/456', 'GET'),
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
      makeFetchRequestEvent(
        100,
        'req1',
        'https://example.com/api',
        'GET',
        { 'x-request-header': 'req-value' }
      ),
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
