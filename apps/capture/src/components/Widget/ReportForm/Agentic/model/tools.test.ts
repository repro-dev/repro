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

describe('tools', () => {
  it('exports an array of tool definitions', () => {
    assert.ok(Array.isArray(tools))
    assert.ok(tools.length > 0)
  })

  it('includes getRecordingDuration tool definition', () => {
    const def = tools.find(
      t => (t as { function: { name: string } }).function.name === 'getRecordingDuration'
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
  it('returns zero duration for empty event list', () => {
    const events = new List(SourceEventView, [])
    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getRecordingDuration', {}) as {
      durationMs: number
    }
    assert.strictEqual(result.durationMs, 0)
  })

  it('returns duration as difference between last and first event time', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 100,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: 'a1b2',
            requestType: RequestType.Fetch,
            url: 'https://example.com/api',
            method: 'GET',
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 5100,
          data: new Box({
            type: NetworkMessageType.FetchResponse,
            correlationId: 'a1b2',
            status: 200,
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
    ])

    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getRecordingDuration', {}) as {
      durationMs: number
    }
    assert.strictEqual(result.durationMs, 5000)
  })

  it('returns zero when there is only one event', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 999,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: 'c3d4',
            requestType: RequestType.Fetch,
            url: 'https://example.com/single',
            method: 'GET',
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
    ])

    const accessor = makeAccessor(events)
    const result = executeTool(accessor, 'getRecordingDuration', {}) as {
      durationMs: number
    }
    assert.strictEqual(result.durationMs, 0)
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
