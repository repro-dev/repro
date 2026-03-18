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

function makeConsoleEvent(
  time: number,
  level: LogLevel,
  text: string
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
        stack: [],
      },
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
    const accessor = makeAccessor(new List(SourceEventView, []), 12345)
    const result = executeTool(accessor, 'getRecordingDuration', {}) as {
      durationMs: number
    }
    assert.strictEqual(result.durationMs, 12345)
  })

  it('returns zero when duration is 0', () => {
    const accessor = makeAccessor(new List(SourceEventView, []), 0)
    const result = executeTool(accessor, 'getRecordingDuration', {}) as {
      durationMs: number
    }
    assert.strictEqual(result.durationMs, 0)
  })
})

describe('executeTool — getConsoleMessages', () => {
  it('returns empty messages array when no events exist', () => {
    const accessor = makeEmptyAccessor()
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: unknown[]
    }
    assert.deepStrictEqual(result, { messages: [] })
  })

  it('returns all messages when no args supplied (defaults to info level)', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Info, 'info message'),
      makeConsoleEvent(200, LogLevel.Warning, 'warning message'),
      makeConsoleEvent(300, LogLevel.Error, 'error message'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 3)
    assert.strictEqual(result.messages[0]!.level, 'info')
    assert.strictEqual(result.messages[1]!.level, 'warning')
    assert.strictEqual(result.messages[2]!.level, 'error')
  })

  it('excludes verbose messages when logLevel defaults to info', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Verbose, 'verbose message'),
      makeConsoleEvent(200, LogLevel.Info, 'info message'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 1)
    assert.strictEqual(result.messages[0]!.level, 'info')
  })

  it('includes verbose messages when logLevel is verbose', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Verbose, 'verbose message'),
      makeConsoleEvent(200, LogLevel.Info, 'info message'),
      makeConsoleEvent(300, LogLevel.Warning, 'warning message'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      logLevel: 'verbose',
    }) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 3)
  })

  it('filters to only warning and above when logLevel is warning', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Verbose, 'verbose'),
      makeConsoleEvent(200, LogLevel.Info, 'info'),
      makeConsoleEvent(300, LogLevel.Warning, 'warning'),
      makeConsoleEvent(400, LogLevel.Error, 'error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      logLevel: 'warning',
    }) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 2)
    assert.strictEqual(result.messages[0]!.level, 'warning')
    assert.strictEqual(result.messages[1]!.level, 'error')
  })

  it('filters to only error level when logLevel is error', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Verbose, 'verbose'),
      makeConsoleEvent(200, LogLevel.Info, 'info'),
      makeConsoleEvent(300, LogLevel.Warning, 'warning'),
      makeConsoleEvent(400, LogLevel.Error, 'error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      logLevel: 'error',
    }) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 1)
    assert.strictEqual(result.messages[0]!.level, 'error')
    assert.strictEqual(result.messages[0]!.text, 'error')
  })

  it('includes message text correctly', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Info, 'hello world'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages[0]!.text, 'hello world')
    assert.strictEqual(result.messages[0]!.timeMs, 100)
  })

  it('includes timeMs in each message', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(500, LogLevel.Info, 'timed message'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages[0]!.timeMs, 500)
  })

  it('filters by timeRangeStartMs', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Info, 'before range'),
      makeConsoleEvent(500, LogLevel.Info, 'in range'),
      makeConsoleEvent(800, LogLevel.Info, 'also in range'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      timeRangeStartMs: 400,
    }) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 2)
    assert.strictEqual(result.messages[0]!.timeMs, 500)
    assert.strictEqual(result.messages[1]!.timeMs, 800)
  })

  it('filters by timeRangeEndMs', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Info, 'in range'),
      makeConsoleEvent(500, LogLevel.Info, 'also in range'),
      makeConsoleEvent(900, LogLevel.Info, 'after range'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      timeRangeEndMs: 600,
    }) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 2)
    assert.strictEqual(result.messages[0]!.timeMs, 100)
    assert.strictEqual(result.messages[1]!.timeMs, 500)
  })

  it('filters by both timeRangeStartMs and timeRangeEndMs', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Info, 'too early'),
      makeConsoleEvent(300, LogLevel.Info, 'in window'),
      makeConsoleEvent(600, LogLevel.Info, 'also in window'),
      makeConsoleEvent(900, LogLevel.Info, 'too late'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      timeRangeStartMs: 200,
      timeRangeEndMs: 700,
    }) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 2)
    assert.strictEqual(result.messages[0]!.timeMs, 300)
    assert.strictEqual(result.messages[1]!.timeMs, 600)
  })

  it('combines logLevel and time range filters', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Error, 'too early error'),
      makeConsoleEvent(300, LogLevel.Info, 'info in window - excluded by level'),
      makeConsoleEvent(400, LogLevel.Error, 'error in window'),
      makeConsoleEvent(900, LogLevel.Error, 'too late error'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {
      logLevel: 'error',
      timeRangeStartMs: 200,
      timeRangeEndMs: 800,
    }) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 1)
    assert.strictEqual(result.messages[0]!.timeMs, 400)
    assert.strictEqual(result.messages[0]!.level, 'error')
  })

  it('ignores non-console events in the event list', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 50,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: 'ab12',
            requestType: RequestType.Fetch,
            url: 'https://example.com/',
            method: 'GET',
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
      makeConsoleEvent(100, LogLevel.Info, 'console message'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ timeMs: number; level: string; text: string }>
    }
    assert.strictEqual(result.messages.length, 1)
    assert.strictEqual(result.messages[0]!.text, 'console message')
  })

  it('includes stack entries when present', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 100,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'with stack',
              }),
            ],
            stack: [
              {
                functionName: 'myFn',
                fileName: 'app.js',
                lineNumber: 42,
                columnNumber: 10,
              },
            ],
          },
        })
      ),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{
        timeMs: number
        level: string
        text: string
        stack?: Array<{
          functionName?: string
          fileName: string
          line: number
          column: number
        }>
      }>
    }
    assert.strictEqual(result.messages.length, 1)
    assert.ok(result.messages[0]!.stack !== undefined)
    assert.strictEqual(result.messages[0]!.stack!.length, 1)
    assert.strictEqual(result.messages[0]!.stack![0]!.functionName, 'myFn')
    assert.strictEqual(result.messages[0]!.stack![0]!.fileName, 'app.js')
    assert.strictEqual(result.messages[0]!.stack![0]!.line, 42)
    assert.strictEqual(result.messages[0]!.stack![0]!.column, 10)
  })

  it('omits stack field when stack is empty', () => {
    const events = new List(SourceEventView, [
      makeConsoleEvent(100, LogLevel.Info, 'no stack'),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{
        timeMs: number
        level: string
        text: string
        stack?: unknown[]
      }>
    }
    assert.strictEqual(result.messages.length, 1)
    assert.strictEqual(result.messages[0]!.stack, undefined)
  })

  it('serializes undefined message parts', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 100,
          data: {
            level: LogLevel.Info,
            parts: [
              new Box({
                type: MessagePartType.Undefined,
              }),
            ],
            stack: [],
          },
        })
      ),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ text: string }>
    }
    assert.strictEqual(result.messages[0]!.text, 'undefined')
  })

  it('serializes node message parts as [DOM Node]', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 100,
          data: {
            level: LogLevel.Info,
            parts: [
              new Box({
                type: MessagePartType.Node,
                node: null,
              }),
            ],
            stack: [],
          },
        })
      ),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ text: string }>
    }
    assert.strictEqual(result.messages[0]!.text, '[DOM Node]')
  })

  it('joins multiple message parts with spaces', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 100,
          data: {
            level: LogLevel.Info,
            parts: [
              new Box({ type: MessagePartType.String, value: 'hello' }),
              new Box({ type: MessagePartType.String, value: 'world' }),
            ],
            stack: [],
          },
        })
      ),
    ])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getConsoleMessages', {}) as {
      messages: Array<{ text: string }>
    }
    assert.strictEqual(result.messages[0]!.text, 'hello world')
  })
})
