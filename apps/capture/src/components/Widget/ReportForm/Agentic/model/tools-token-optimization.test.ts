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
import { executeTool } from './tools'

function makeAccessor(
  events: List<SourceEventView>,
  duration?: number
): RecordingDataAccessor {
  return {
    getSourceEvents: () => events,
    getDuration: () => duration ?? 0,
    getSnapshotAtTime: () => null,
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

function makeFetchResponseEventWithBody(
  time: number,
  correlationId: string,
  status: number,
  body: string,
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
        body: new TextEncoder().encode(body).buffer,
      }),
    })
  )
}

function makeFetchRequestEventWithBody(
  time: number,
  correlationId: string,
  url: string,
  method: string,
  body: string,
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
        body: new TextEncoder().encode(body).buffer,
      }),
    })
  )
}

describe('executeTool — getNetworkRequests (token optimization)', () => {
  it('summary tier: returns pathname-only URL for fetch', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(
        100,
        'req1',
        'https://example.com/api/users?page=2',
        'GET'
      ),
      makeFetchResponseEvent(200, 'req1', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'summary',
    }) as {
      requests: Array<{ url: string; method?: string }>
    }
    assert.strictEqual(result.requests[0]!.url, '/api/users')
    assert.strictEqual(result.requests[0]!.method, undefined)
  })

  it('normal tier: returns pathname+query URL truncated to 100 chars for fetch', () => {
    const longPath = '/api/' + 'a'.repeat(200)
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(
        100,
        'req1',
        `https://example.com${longPath}`,
        'GET'
      ),
      makeFetchResponseEvent(200, 'req1', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'normal',
    }) as {
      requests: Array<{ url: string }>
    }
    assert.ok(result.requests[0]!.url.length <= 100)
  })

  it('full tier: returns full URL for fetch', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(
        100,
        'req1',
        'https://example.com/api/users?page=2',
        'GET'
      ),
      makeFetchResponseEvent(200, 'req1', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'full',
    }) as {
      requests: Array<{ url: string }>
    }
    assert.strictEqual(
      result.requests[0]!.url,
      'https://example.com/api/users?page=2'
    )
  })

  it('normal tier: includes errorBody for failed responses', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEventWithBody(200, 'req1', 500, 'Internal Server Error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'normal',
    }) as {
      requests: Array<{ errorBody?: string }>
    }
    assert.strictEqual(result.requests[0]!.errorBody, 'Internal Server Error')
  })

  it('normal tier: does not include errorBody for successful responses', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEventWithBody(200, 'req1', 200, 'OK body'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'normal',
    }) as {
      requests: Array<{ errorBody?: string }>
    }
    assert.strictEqual(result.requests[0]!.errorBody, undefined)
  })

  it('normal tier: errorBody is truncated to 500 chars', () => {
    const longBody = 'e'.repeat(600)
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEventWithBody(200, 'req1', 500, longBody),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'normal',
    }) as {
      requests: Array<{ errorBody?: string }>
    }
    assert.ok(result.requests[0]!.errorBody !== undefined)
    assert.ok(result.requests[0]!.errorBody!.length <= 500)
  })

  it('full tier: errorBody is truncated to 2000 chars', () => {
    const longBody = 'e'.repeat(2500)
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEventWithBody(200, 'req1', 500, longBody),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'full',
    }) as {
      requests: Array<{ errorBody?: string }>
    }
    assert.ok(result.requests[0]!.errorBody !== undefined)
    assert.ok(result.requests[0]!.errorBody!.length <= 2000)
  })

  it('full tier: includes requestBody for POST requests', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEventWithBody(
        100,
        'req1',
        'https://example.com/api',
        'POST',
        '{"name":"test"}'
      ),
      makeFetchResponseEvent(200, 'req1', 201),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'full',
    }) as {
      requests: Array<{ requestBody?: string }>
    }
    assert.strictEqual(result.requests[0]!.requestBody, '{"name":"test"}')
  })

  it('full tier: does not include requestBody for GET requests', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEventWithBody(
        100,
        'req1',
        'https://example.com/api',
        'GET',
        'should-not-appear'
      ),
      makeFetchResponseEvent(200, 'req1', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'full',
    }) as {
      requests: Array<{ requestBody?: string }>
    }
    assert.strictEqual(result.requests[0]!.requestBody, undefined)
  })

  it('full tier: includes filtered headers (content-type, x-request-id only)', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEvent(200, 'req1', 200, {
        'content-type': 'application/json',
        'x-request-id': 'abc123',
        authorization: 'Bearer token',
        'set-cookie': 'session=xyz',
        'x-custom-header': 'custom-value',
      }),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'full',
    }) as {
      requests: Array<{ headers?: Record<string, string> }>
    }
    const headers = result.requests[0]!.headers
    assert.ok(headers !== undefined)
    assert.strictEqual(headers['content-type'], 'application/json')
    assert.strictEqual(headers['x-request-id'], 'abc123')
    assert.strictEqual(headers['authorization'], undefined)
    assert.strictEqual(headers['set-cookie'], undefined)
    assert.strictEqual(headers['x-custom-header'], undefined)
  })

  it('never includes cookies at any tier', () => {
    for (const detail of ['summary', 'normal', 'full'] as const) {
      const events = new List(SourceEventView, [
        makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET', {
          cookie: 'session=abc',
        }),
        makeFetchResponseEvent(200, 'req1', 200, {
          'set-cookie': 'session=xyz',
        }),
      ])
      const accessor = makeAccessor(events)
      const result = executeTool(accessor, 'getNetworkRequests', {
        detail,
      }) as {
        requests: Array<Record<string, unknown>>
      }
      const req = result.requests[0]!
      const jsonStr = JSON.stringify(req)
      assert.ok(
        !jsonStr.includes('cookie'),
        `detail=${detail} must not include cookie`
      )
      assert.ok(
        !jsonStr.includes('set-cookie'),
        `detail=${detail} must not include set-cookie`
      )
    }
  })

  it('always includes summary stats', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(200, 'req2', 'https://example.com/api', 'POST'),
      makeFetchResponseEvent(250, 'req2', 404),
      makeWebSocketOpenEvent(300, 'ws1', 'wss://example.com/socket'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      summary: {
        total: number
        succeeded: number
        failed: number
        byMethod: Record<string, number>
      }
      _tokenEstimate: number
    }
    assert.strictEqual(result.summary.total, 3)
    assert.strictEqual(result.summary.succeeded, 1)
    assert.strictEqual(result.summary.failed, 1)
    assert.strictEqual(result.summary.byMethod['GET'], 1)
    assert.strictEqual(result.summary.byMethod['POST'], 1)
    assert.ok(typeof result._tokenEstimate === 'number')
  })

  it('summary stats: byMethod excludes websocket requests', () => {
    const events = new List(SourceEventView, [
      makeWebSocketOpenEvent(50, 'ws1', 'wss://example.com/socket'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      summary: { byMethod: Record<string, number> }
    }
    assert.deepStrictEqual(result.summary.byMethod, {})
  })

  it('summary stats: pending fetch (no response) counts as succeeded', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      summary: { succeeded: number; failed: number }
    }
    assert.strictEqual(result.summary.succeeded, 1)
    assert.strictEqual(result.summary.failed, 0)
  })

  it('always includes _tokenEstimate', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      _tokenEstimate: number
    }
    assert.ok(typeof result._tokenEstimate === 'number')
    assert.ok(result._tokenEstimate >= 0)
  })

  it('urlPattern filter applies to original URL (not shortened)', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(
        100,
        'req1',
        'https://api.example.com/users',
        'GET'
      ),
      makeFetchResponseEvent(150, 'req1', 200),
      makeFetchRequestEvent(
        200,
        'req2',
        'https://api.example.com/products',
        'GET'
      ),
      makeFetchResponseEvent(250, 'req2', 200),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'summary',
      urlPattern: '/users',
    }) as {
      requests: unknown[]
    }
    assert.strictEqual(result.requests.length, 1)
  })

  it('summary tier: returns pathname-only URL for websocket', () => {
    const events = new List(SourceEventView, [
      makeWebSocketOpenEvent(50, 'ws1', 'wss://example.com/socket?token=abc'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'summary',
    }) as {
      requests: Array<{ url: string }>
    }
    assert.strictEqual(result.requests[0]!.url, '/socket')
  })

  it('normal tier: does not include headers', () => {
    const events = new List(SourceEventView, [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/api', 'GET'),
      makeFetchResponseEvent(200, 'req1', 200, {
        'content-type': 'application/json',
      }),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getNetworkRequests', {
      detail: 'normal',
    }) as {
      requests: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.requests[0]!['headers'], undefined)
    assert.strictEqual(result.requests[0]!['requestHeaders'], undefined)
    assert.strictEqual(result.requests[0]!['responseHeaders'], undefined)
  })
})
