import { SourceEventView } from '@repro/domain'
import { List } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  accumulateToolCalls,
  executeToolCalls,
  isValidMessageDelta,
} from './createState'
import { RecordingDataAccessor, ToolCall } from './types'

function makeEmptyAccessor(): RecordingDataAccessor {
  return {
    getSourceEvents: () => new List(SourceEventView, []),
    getDuration: () => 0,
  }
}

describe('isValidMessageDelta', () => {
  it('accepts valid delta with content', () => {
    const data = {
      choices: [{ delta: { content: 'hello' } }],
    }
    assert.strictEqual(isValidMessageDelta(data), true)
  })

  it('accepts valid delta with tool_calls', () => {
    const data = {
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'tc1', function: { name: 'foo', arguments: '' } },
            ],
          },
        },
      ],
    }
    assert.strictEqual(isValidMessageDelta(data), true)
  })

  it('accepts valid delta with empty delta object', () => {
    const data = { choices: [{ delta: {} }] }
    assert.strictEqual(isValidMessageDelta(data), true)
  })

  it('rejects null', () => {
    assert.strictEqual(isValidMessageDelta(null), false)
  })

  it('rejects undefined', () => {
    assert.strictEqual(isValidMessageDelta(undefined), false)
  })

  it('rejects plain string', () => {
    assert.strictEqual(isValidMessageDelta('hello'), false)
  })

  it('rejects object without choices', () => {
    assert.strictEqual(isValidMessageDelta({ role: 'assistant' }), false)
  })

  it('rejects object with empty choices array', () => {
    assert.strictEqual(isValidMessageDelta({ choices: [] }), false)
  })

  it('rejects object with non-array choices', () => {
    assert.strictEqual(isValidMessageDelta({ choices: 'bad' }), false)
  })

  it('rejects when choices[0].delta is null', () => {
    assert.strictEqual(isValidMessageDelta({ choices: [{ delta: null }] }), false)
  })

  it('rejects when choices[0].delta is missing', () => {
    assert.strictEqual(isValidMessageDelta({ choices: [{}] }), false)
  })
})

describe('accumulateToolCalls', () => {
  it('first delta creates new entry with id, index, function.name, function.arguments', () => {
    const result = accumulateToolCalls([], [
      { index: 0, id: 'tc1', function: { name: 'myTool', arguments: '{"a":' } },
    ])
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]!.id, 'tc1')
    assert.strictEqual(result[0]!.index, 0)
    assert.strictEqual(result[0]!.function.name, 'myTool')
    assert.strictEqual(result[0]!.function.arguments, '{"a":')
  })

  it('subsequent deltas append arguments only (not name)', () => {
    const initial = accumulateToolCalls([], [
      { index: 0, id: 'tc1', function: { name: 'myTool', arguments: '{"a":' } },
    ])
    const result = accumulateToolCalls(initial, [
      { index: 0, function: { arguments: '1}' } },
    ])
    assert.strictEqual(result[0]!.function.name, 'myTool')
    assert.strictEqual(result[0]!.function.arguments, '{"a":1}')
  })

  it('sparse index handling — delta at index 2 with empty array', () => {
    const result = accumulateToolCalls([], [
      { index: 2, id: 'tc2', function: { name: 'sparseFunc', arguments: '' } },
    ])
    assert.strictEqual(result[2]!.id, 'tc2')
    assert.strictEqual(result[2]!.function.name, 'sparseFunc')
  })

  it('multiple parallel tool calls accumulate correctly', () => {
    const step1 = accumulateToolCalls([], [
      { index: 0, id: 'tc0', function: { name: 'funcA', arguments: '{"x":' } },
      { index: 1, id: 'tc1', function: { name: 'funcB', arguments: '{"y":' } },
    ])
    const result = accumulateToolCalls(step1, [
      { index: 0, function: { arguments: '1}' } },
      { index: 1, function: { arguments: '2}' } },
    ])
    assert.strictEqual(result[0]!.function.arguments, '{"x":1}')
    assert.strictEqual(result[1]!.function.arguments, '{"y":2}')
  })

  it('returns new array (immutability)', () => {
    const original: Array<ToolCall> = []
    const result = accumulateToolCalls(original, [
      { index: 0, id: 'tc1', function: { name: 'f', arguments: '' } },
    ])
    assert.notStrictEqual(result, original)
  })

  it('defaults missing id to empty string', () => {
    const result = accumulateToolCalls([], [
      { index: 0, function: { name: 'f', arguments: '' } },
    ])
    assert.strictEqual(result[0]!.id, '')
  })

  it('defaults missing name to empty string', () => {
    const result = accumulateToolCalls([], [
      { index: 0, id: 'tc1', function: { arguments: '' } },
    ])
    assert.strictEqual(result[0]!.function.name, '')
  })

  it('defaults missing arguments to empty string', () => {
    const result = accumulateToolCalls([], [
      { index: 0, id: 'tc1', function: { name: 'f' } },
    ])
    assert.strictEqual(result[0]!.function.arguments, '')
  })

  it('id from existing entry takes precedence over empty delta id', () => {
    const initial = accumulateToolCalls([], [
      { index: 0, id: 'original-id', function: { name: 'f', arguments: '' } },
    ])
    const result = accumulateToolCalls(initial, [
      { index: 0, id: '', function: { arguments: 'more' } },
    ])
    assert.strictEqual(result[0]!.id, 'original-id')
  })

  it('backfills id from later delta when existing id is empty', () => {
    const initial = accumulateToolCalls([], [
      { index: 0, function: { name: 'f', arguments: '' } },
    ])
    const result = accumulateToolCalls(initial, [
      { index: 0, id: 'later-id', function: { arguments: 'args' } },
    ])
    assert.strictEqual(result[0]!.id, 'later-id')
  })

  it('delta with name overwrites existing name', () => {
    const initial = accumulateToolCalls([], [
      { index: 0, id: 'tc1', function: { name: 'original', arguments: '' } },
    ])
    const result = accumulateToolCalls(initial, [
      { index: 0, function: { name: 'overwritten', arguments: '' } },
    ])
    assert.strictEqual(result[0]!.function.name, 'overwritten')
  })

  it('delta without name preserves existing name', () => {
    const initial = accumulateToolCalls([], [
      { index: 0, id: 'tc1', function: { name: 'keepMe', arguments: '' } },
    ])
    const result = accumulateToolCalls(initial, [
      { index: 0, function: { arguments: 'extra' } },
    ])
    assert.strictEqual(result[0]!.function.name, 'keepMe')
  })
})

describe('executeToolCalls', () => {
  it('returns empty array for empty input', () => {
    const accessor = makeEmptyAccessor()
    const result = executeToolCalls(accessor, [])
    assert.deepStrictEqual(result, [])
  })

  it('produces ToolMessage entries for valid tool calls', () => {
    const accessor = makeEmptyAccessor()
    const toolCalls: Array<ToolCall> = [
      { id: 'tc1', index: 0, function: { name: 'getRecordingDuration', arguments: '{}' } },
    ]
    const result = executeToolCalls(accessor, toolCalls, () => 'fixed-id')
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]!.role, 'tool')
  })

  it('each result includes correct tool_call_id', () => {
    const accessor = makeEmptyAccessor()
    const toolCalls: Array<ToolCall> = [
      { id: 'my-call-id', index: 0, function: { name: 'getRecordingDuration', arguments: '{}' } },
    ]
    const result = executeToolCalls(accessor, toolCalls, () => 'fixed-id')
    assert.strictEqual(result[0]!.tool_call_id, 'my-call-id')
  })

  it('result content is JSON-serialized tool output', () => {
    const accessor = makeEmptyAccessor()
    const toolCalls: Array<ToolCall> = [
      { id: 'tc1', index: 0, function: { name: 'getRecordingDuration', arguments: '{}' } },
    ]
    const result = executeToolCalls(accessor, toolCalls, () => 'fixed-id')
    const parsed = JSON.parse(result[0]!.content) as { durationMs: number }
    assert.strictEqual(parsed.durationMs, 0)
  })

  it('malformed JSON arguments produce error message', () => {
    const accessor = makeEmptyAccessor()
    const toolCalls: Array<ToolCall> = [
      { id: 'tc1', index: 0, function: { name: 'getRecordingDuration', arguments: 'not-json' } },
    ]
    const result = executeToolCalls(accessor, toolCalls, () => 'fixed-id')
    const parsed = JSON.parse(result[0]!.content) as { error: string }
    assert.ok(typeof parsed.error === 'string')
  })

  it('unknown tool name produces error message', () => {
    const accessor = makeEmptyAccessor()
    const toolCalls: Array<ToolCall> = [
      { id: 'tc1', index: 0, function: { name: 'nonExistentTool', arguments: '{}' } },
    ]
    const result = executeToolCalls(accessor, toolCalls, () => 'fixed-id')
    const parsed = JSON.parse(result[0]!.content) as { error: string }
    assert.ok(parsed.error.includes('nonExistentTool'))
  })

  it('empty arguments string treated as empty object', () => {
    const accessor = makeEmptyAccessor()
    const toolCalls: Array<ToolCall> = [
      { id: 'tc1', index: 0, function: { name: 'getRecordingDuration', arguments: '' } },
    ]
    const result = executeToolCalls(accessor, toolCalls, () => 'fixed-id')
    assert.strictEqual(result.length, 1)
    const parsed = JSON.parse(result[0]!.content) as { durationMs: number }
    assert.strictEqual(parsed.durationMs, 0)
  })

  it('filters out falsy entries in sparse array', () => {
    const accessor = makeEmptyAccessor()
    const sparse = [] as Array<ToolCall>
    sparse[2] = { id: 'tc2', index: 2, function: { name: 'getRecordingDuration', arguments: '{}' } }
    const result = executeToolCalls(accessor, sparse, () => 'fixed-id')
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]!.tool_call_id, 'tc2')
  })
})
