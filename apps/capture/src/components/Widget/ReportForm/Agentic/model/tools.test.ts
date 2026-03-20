import {
  LogLevel,
  MessagePartType,
  NetworkMessageType,
  NodeType,
  RequestType,
  Snapshot,
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
  duration?: number,
  snapshotFn?: (timestampMs: number) => Snapshot | null
): RecordingDataAccessor {
  return {
    getSourceEvents: () => events,
    getDuration: () => duration ?? 0,
    getSnapshotAtTime: snapshotFn ?? (() => null),
  }
}

function makeEmptyAccessor(): RecordingDataAccessor {
  return makeAccessor(new List(SourceEventView, []))
}

function makeSimpleSnapshot(): Snapshot {
  return {
    dom: {
      rootId: 'root',
      nodes: {
        root: new Box({
          type: NodeType.Document as NodeType.Document,
          id: 'root',
          parentId: null,
          children: ['btn'],
        }),
        btn: new Box({
          type: NodeType.Element as NodeType.Element,
          id: 'btn',
          parentId: 'root',
          tagName: 'button',
          children: ['txt'],
          attributes: { 'aria-label': 'Submit' },
          properties: { value: null, checked: null, selectedIndex: null },
          shadowRoot: false,
        }),
        txt: new Box({
          type: NodeType.Text as NodeType.Text,
          id: 'txt',
          parentId: 'btn',
          value: 'Submit',
        }),
      },
    },
    interaction: null,
  }
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

  it('getRecordingDuration tool includes detail parameter', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name ===
        'getRecordingDuration'
    ) as {
      function: {
        parameters: { properties: Record<string, { type: string; enum?: string[] }> }
      }
    }
    assert.ok(def !== undefined)
    assert.ok(def.function.parameters !== undefined)
    assert.ok(def.function.parameters.properties.detail !== undefined)
    assert.deepStrictEqual(def.function.parameters.properties.detail.enum, [
      'summary',
      'normal',
      'full',
    ])
  })

  it('getConsoleMessages tool includes detail parameter', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name ===
        'getConsoleMessages'
    ) as {
      function: {
        parameters: { properties: Record<string, { type: string; enum?: string[] }> }
      }
    }
    assert.ok(def !== undefined)
    assert.ok(def.function.parameters.properties.detail !== undefined)
    assert.deepStrictEqual(def.function.parameters.properties.detail.enum, [
      'summary',
      'normal',
      'full',
    ])
  })

  it('getNetworkRequests tool includes detail parameter', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name ===
        'getNetworkRequests'
    ) as {
      function: {
        parameters: { properties: Record<string, { type: string; enum?: string[] }> }
      }
    }
    assert.ok(def !== undefined)
    assert.ok(def.function.parameters.properties.detail !== undefined)
    assert.deepStrictEqual(def.function.parameters.properties.detail.enum, [
      'summary',
      'normal',
      'full',
    ])
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
      _tokenEstimate: number
    }
    assert.strictEqual(result.durationMs, 9876)
  })

  it('includes _tokenEstimate in response', () => {
    const accessor = makeAccessor(new List(SourceEventView, []), 9876)
    const result = executeTool(accessor, 'getRecordingDuration', {}) as {
      durationMs: number
      _tokenEstimate: number
    }
    assert.ok(typeof result._tokenEstimate === 'number')
    assert.ok(result._tokenEstimate > 0)
  })
})

function makeConsoleEvent(
  time: number,
  level: LogLevel,
  text: string,
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
        level,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: text,
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

describe('executeTool — getConsoleMessages (stub)', () => {
  it('returns empty messages array with summary and _tokenEstimate', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: unknown[]
      summary: { verbose: number; info: number; warning: number; error: number }
      _tokenEstimate: number
    }
    assert.deepStrictEqual(result.messages, [])
    assert.ok(result.summary !== undefined)
    assert.ok(typeof result._tokenEstimate === 'number')
  })
})

describe('executeTool — getConsoleMessages (token optimization)', () => {
  it('detail=summary returns only error messages, max 3', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Info, 'info message'),
      makeConsoleEvent(200, LogLevel.Warning, 'warning message'),
      makeConsoleEvent(300, LogLevel.Error, 'error one'),
      makeConsoleEvent(400, LogLevel.Error, 'error two'),
      makeConsoleEvent(500, LogLevel.Error, 'error three'),
      makeConsoleEvent(600, LogLevel.Error, 'error four'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'summary',
    }) as { messages: Array<{ level: string }> }
    assert.ok(result.messages.every(m => m.level === 'error'))
    assert.ok(result.messages.length <= 3)
  })

  it('detail=summary truncates text to 100 chars', () => {
    const longText = 'a'.repeat(150)
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Error, longText),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'summary',
    }) as { messages: Array<{ text: string }> }
    assert.ok(result.messages[0]!.text.length <= 100)
    assert.ok(result.messages[0]!.text.endsWith('…'))
  })

  it('detail=summary omits stack traces', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Error, 'error', [
        {
          fileName: 'https://cdn.example.com/app.js',
          lineNumber: 10,
          columnNumber: 5,
        },
      ]),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'summary',
    }) as { messages: Array<{ stack?: unknown }> }
    assert.ok(result.messages[0]!.stack === undefined)
  })

  it('detail=summary deduplicates identical messages with count', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Error, 'same error'),
      makeConsoleEvent(200, LogLevel.Error, 'same error'),
      makeConsoleEvent(300, LogLevel.Error, 'same error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'summary',
    }) as { messages: Array<{ text: string; count: number; timeMs: number }> }
    assert.strictEqual(result.messages.length, 1)
    assert.strictEqual(result.messages[0]!.count, 3)
    assert.strictEqual(result.messages[0]!.timeMs, 100)
  })

  it('detail=normal includes errors and warnings', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Verbose, 'verbose message'),
      makeConsoleEvent(200, LogLevel.Info, 'info message'),
      makeConsoleEvent(300, LogLevel.Warning, 'warning message'),
      makeConsoleEvent(400, LogLevel.Error, 'error message'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'normal',
    }) as { messages: Array<{ level: string }> }
    const levels = result.messages.map(m => m.level)
    assert.ok(levels.includes('warning'))
    assert.ok(levels.includes('error'))
    assert.ok(!levels.includes('verbose'))
    assert.ok(!levels.includes('info'))
  })

  it('detail=normal truncates text to 200 chars', () => {
    const longText = 'b'.repeat(300)
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Warning, longText),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'normal',
    }) as { messages: Array<{ text: string }> }
    assert.ok(result.messages[0]!.text.length <= 200)
    assert.ok(result.messages[0]!.text.endsWith('…'))
  })

  it('detail=normal shortens stack frames to basename:line:col format, max 3 frames', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Warning, 'warn', [
        {
          fileName: 'https://cdn.example.com/static/js/ProductList.tsx',
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          fileName: 'https://cdn.example.com/static/js/renderWithHooks.js',
          lineNumber: 18,
          columnNumber: 5,
        },
        {
          fileName: 'https://cdn.example.com/static/js/App.tsx',
          lineNumber: 10,
          columnNumber: 3,
        },
        {
          fileName: 'https://cdn.example.com/static/js/index.js',
          lineNumber: 1,
          columnNumber: 1,
        },
      ]),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'normal',
    }) as { messages: Array<{ stack?: string[] }> }
    const stack = result.messages[0]!.stack!
    assert.ok(Array.isArray(stack))
    assert.ok(stack.length <= 3)
    assert.strictEqual(stack[0], 'ProductList.tsx:42:10')
    assert.strictEqual(stack[1], 'renderWithHooks.js:18:5')
  })

  it('detail=normal deduplicates identical messages with count', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Warning, 'same warning'),
      makeConsoleEvent(200, LogLevel.Warning, 'same warning'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'normal',
    }) as { messages: Array<{ text: string; count: number }> }
    assert.strictEqual(result.messages.length, 1)
    assert.strictEqual(result.messages[0]!.count, 2)
  })

  it('detail=full includes all messages at requested level', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Verbose, 'verbose message'),
      makeConsoleEvent(200, LogLevel.Info, 'info message'),
      makeConsoleEvent(300, LogLevel.Warning, 'warning message'),
      makeConsoleEvent(400, LogLevel.Error, 'error message'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'full',
      logLevel: 'verbose',
    }) as { messages: Array<{ level: string }> }
    const levels = result.messages.map(m => m.level)
    assert.ok(levels.includes('verbose'))
    assert.ok(levels.includes('info'))
    assert.ok(levels.includes('warning'))
    assert.ok(levels.includes('error'))
  })

  it('detail=full truncates text to 500 chars', () => {
    const longText = 'c'.repeat(600)
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Info, longText),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'full',
      logLevel: 'info',
    }) as { messages: Array<{ text: string }> }
    assert.ok(result.messages[0]!.text.length <= 500)
    assert.ok(result.messages[0]!.text.endsWith('…'))
  })

  it('detail=full includes stack frames up to 10 with no dedup', () => {
    const stack = Array.from({ length: 12 }, (_, i) => ({
      fileName: `https://cdn.example.com/file${i}.js`,
      lineNumber: i + 1,
      columnNumber: 1,
    }))
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Error, 'error one', stack),
      makeConsoleEvent(200, LogLevel.Error, 'error one', stack),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'full',
    }) as {
      messages: Array<{ text: string; stack?: string[]; count?: number }>
    }
    assert.strictEqual(result.messages.length, 2)
    assert.ok(result.messages[0]!.count === undefined)
    assert.ok(result.messages[0]!.stack!.length <= 10)
  })

  it('all tiers include summary with level counts', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Verbose, 'v1'),
      makeConsoleEvent(200, LogLevel.Info, 'i1'),
      makeConsoleEvent(300, LogLevel.Info, 'i2'),
      makeConsoleEvent(400, LogLevel.Warning, 'w1'),
      makeConsoleEvent(500, LogLevel.Error, 'e1'),
      makeConsoleEvent(600, LogLevel.Error, 'e2'),
      makeConsoleEvent(700, LogLevel.Error, 'e3'),
    ])
    const accessor = makeAccessor(events)

    for (const detail of ['summary', 'normal', 'full'] as const) {
      const result = executeTool(accessor, 'getConsoleMessages', {
        detail,
        logLevel: 'verbose',
      }) as {
        summary: {
          verbose: number
          info: number
          warning: number
          error: number
        }
      }
      assert.ok(result.summary !== undefined, `${detail} should have summary`)
      assert.strictEqual(result.summary.verbose, 1, `${detail} verbose count`)
      assert.strictEqual(result.summary.info, 2, `${detail} info count`)
      assert.strictEqual(result.summary.warning, 1, `${detail} warning count`)
      assert.strictEqual(result.summary.error, 3, `${detail} error count`)
    }
  })

  it('all tiers include _tokenEstimate', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Error, 'error message'),
    ])
    const accessor = makeAccessor(events)

    for (const detail of ['summary', 'normal', 'full'] as const) {
      const result = executeTool(accessor, 'getConsoleMessages', {
        detail,
      }) as { _tokenEstimate: number }
      assert.ok(
        typeof result._tokenEstimate === 'number',
        `${detail} should have _tokenEstimate`
      )
      assert.ok(result._tokenEstimate > 0, `${detail} _tokenEstimate > 0`)
    }
  })

  it('default detail is normal when not specified', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Verbose, 'verbose'),
      makeConsoleEvent(200, LogLevel.Info, 'info'),
      makeConsoleEvent(300, LogLevel.Warning, 'warning'),
      makeConsoleEvent(400, LogLevel.Error, 'error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ level: string }>
    }
    const levels = result.messages.map(m => m.level)
    assert.ok(levels.includes('warning'))
    assert.ok(levels.includes('error'))
    assert.ok(!levels.includes('verbose'))
    assert.ok(!levels.includes('info'))
  })

  it('time range filtering still works with detail parameter', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Error, 'early error'),
      makeConsoleEvent(500, LogLevel.Error, 'mid error'),
      makeConsoleEvent(900, LogLevel.Error, 'late error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      detail: 'normal',
      timeRangeStartMs: 200,
      timeRangeEndMs: 700,
    }) as { messages: Array<{ text: string }> }
    assert.strictEqual(result.messages.length, 1)
    assert.ok(result.messages[0]!.text.includes('mid error'))
  })
})

describe('executeTool — getNetworkRequests', () => {
  it('returns empty requests array for empty event list', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'getNetworkRequests', {}) as {
      requests: unknown[]
      summary: unknown
      _tokenEstimate: number
    }
    assert.deepStrictEqual(result.requests, [])
    assert.ok(result.summary !== undefined)
    assert.ok(typeof result._tokenEstimate === 'number')
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
        durationMs: number
      }>
    }
    assert.strictEqual(result.requests.length, 1)
    assert.strictEqual(result.requests[0]!.type, 'fetch')
    assert.strictEqual(result.requests[0]!.method, 'GET')
    assert.strictEqual(result.requests[0]!.status, 200)
    assert.strictEqual(result.requests[0]!.timeMs, 100)
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
})

describe('executeTool — getDOMState', () => {
  it('returns error when no snapshot available', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'getDOMState', {
      timestampMs: 1000,
    }) as { error: string }
    assert.ok(typeof result.error === 'string')
    assert.ok(result.error.includes('No DOM snapshot'))
  })

  it('returns a11y tree for simple DOM in a11y mode', () => {
    const accessor = makeAccessor(
      new List(SourceEventView, []),
      0,
      () => makeSimpleSnapshot()
    )
    const result = executeTool(accessor, 'getDOMState', {
      timestampMs: 0,
      mode: 'a11y',
    }) as { mode: string; tree: string; timestampMs: number }
    assert.strictEqual(result.mode, 'a11y')
    assert.ok(typeof result.tree === 'string')
    assert.ok(result.tree.includes('button'))
    assert.strictEqual(result.timestampMs, 0)
  })

  it('defaults to a11y mode when mode not specified', () => {
    const accessor = makeAccessor(
      new List(SourceEventView, []),
      0,
      () => makeSimpleSnapshot()
    )
    const result = executeTool(accessor, 'getDOMState', {
      timestampMs: 500,
    }) as { mode: string }
    assert.strictEqual(result.mode, 'a11y')
  })

  it('returns summary mode with element counts', () => {
    const accessor = makeAccessor(
      new List(SourceEventView, []),
      0,
      () => makeSimpleSnapshot()
    )
    const result = executeTool(accessor, 'getDOMState', {
      timestampMs: 0,
      mode: 'summary',
    }) as {
      mode: string
      elementCount: number
      textCount: number
      topTags: Array<{ tag: string; count: number }>
    }
    assert.strictEqual(result.mode, 'summary')
    assert.ok(typeof result.elementCount === 'number')
    assert.ok(result.elementCount > 0)
    assert.ok(Array.isArray(result.topTags))
  })

  it('includes _tokenEstimate in a11y mode response', () => {
    const accessor = makeAccessor(
      new List(SourceEventView, []),
      0,
      () => makeSimpleSnapshot()
    )
    const result = executeTool(accessor, 'getDOMState', {
      timestampMs: 0,
      mode: 'a11y',
    }) as { _tokenEstimate: number }
    assert.ok(typeof result._tokenEstimate === 'number')
    assert.ok(result._tokenEstimate > 0)
  })

  it('includes _tokenEstimate in summary mode response', () => {
    const accessor = makeAccessor(
      new List(SourceEventView, []),
      0,
      () => makeSimpleSnapshot()
    )
    const result = executeTool(accessor, 'getDOMState', {
      timestampMs: 0,
      mode: 'summary',
    }) as { _tokenEstimate: number }
    assert.ok(typeof result._tokenEstimate === 'number')
    assert.ok(result._tokenEstimate > 0)
  })

  it('tool definition is included in tools array', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name === 'getDOMState'
    )
    assert.ok(def !== undefined)
  })
})
