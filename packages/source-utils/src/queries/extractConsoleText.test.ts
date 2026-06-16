import { ConsoleEvent, LogLevel, MessagePartType } from '@repro/domain'
import { Box } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { extractConsoleText } from './extractConsoleText'

function makeConsoleEvent(
  time: number,
  level: LogLevel,
  parts: Array<Box<{ type: MessagePartType }>>
): Box<ConsoleEvent> {
  return new Box({
    type: 5, // SourceEventType.Console
    time,
    data: {
      level,
      parts,
      stack: [],
    },
  } as unknown as ConsoleEvent)
}

function mockSerializePart(part: Box<{ type: MessagePartType }>): string {
  const type = part.get('type').orElse(-1 as MessagePartType)
  if (type === MessagePartType.String) {
    return (part as Box<{ type: MessagePartType.String; value: string }>)
      .get('value')
      .orElse('')
  }
  if (type === MessagePartType.Node) {
    return '[DOM Node]'
  }
  if (type === MessagePartType.Undefined) {
    return 'undefined'
  }
  if (type === MessagePartType.Date) {
    return '[Date]'
  }
  return ''
}

describe('extractConsoleText', () => {
  it('extracts time, level, and text from a single-part string message', () => {
    const event = makeConsoleEvent(1000, LogLevel.Error, [
      new Box({ type: MessagePartType.String, value: 'Something went wrong' }),
    ])
    const result = extractConsoleText(event, mockSerializePart)
    assert.strictEqual(result.time, 1000)
    assert.strictEqual(result.level, LogLevel.Error)
    assert.strictEqual(result.text, 'Something went wrong')
  })

  it('extracts info level with multi-part message', () => {
    const event = makeConsoleEvent(500, LogLevel.Info, [
      new Box({ type: MessagePartType.String, value: 'User' }),
      new Box({ type: MessagePartType.String, value: 'logged' }),
      new Box({ type: MessagePartType.String, value: 'in' }),
    ])
    const result = extractConsoleText(event, mockSerializePart)
    assert.strictEqual(result.time, 500)
    assert.strictEqual(result.level, LogLevel.Info)
    assert.strictEqual(result.text, 'User logged in')
  })

  it('handles empty parts array', () => {
    const event = makeConsoleEvent(200, LogLevel.Warning, [])
    const result = extractConsoleText(event, mockSerializePart)
    assert.strictEqual(result.time, 200)
    assert.strictEqual(result.level, LogLevel.Warning)
    assert.strictEqual(result.text, '')
  })

  it('handles node parts', () => {
    const event = makeConsoleEvent(300, LogLevel.Info, [
      new Box({ type: MessagePartType.Node }),
    ])
    const result = extractConsoleText(event, mockSerializePart)
    assert.strictEqual(result.text, '[DOM Node]')
  })

  it('uses defaults for missing data', () => {
    const emptyEvent = new Box(null) as unknown as Box<ConsoleEvent>
    const result = extractConsoleText(emptyEvent, mockSerializePart)
    assert.strictEqual(result.time, 0)
    assert.strictEqual(result.level, LogLevel.Info)
    assert.strictEqual(result.text, '')
  })

  it('passes through non-standard level values from Box', () => {
    // Box.orElse only applies default when the value is null/undefined.
    // A non-standard numeric level value is still non-null, so it passes through.
    const event = new Box({
      type: 5,
      time: 100,
      data: { level: 99, parts: [], stack: [] },
    } as unknown as ConsoleEvent)
    const result = extractConsoleText(event, mockSerializePart)
    assert.strictEqual(result.level, 99)
  })
})
