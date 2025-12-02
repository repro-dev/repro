import {
  LogLevel,
  MessagePartType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box, List } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { findConsoleErrors } from './findConsoleErrors'

describe('findConsoleErrors', () => {
  it('returns empty array when no console errors are present', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 0,
          data: {
            level: LogLevel.Info,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Info message',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 100,
          data: {
            level: LogLevel.Warning,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Warning message',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const errors = findConsoleErrors(events)
    assert.strictEqual(
      errors.size(),
      0,
      'should return empty list for non-error logs'
    )
  })

  it('filters and returns only console error events', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 0,
          data: {
            level: LogLevel.Info,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Info message',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 50,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'First error',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 100,
          data: {
            level: LogLevel.Warning,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Warning message',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 150,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Second error',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const errors = findConsoleErrors(events)
    assert.strictEqual(errors.size(), 2, 'should return only error events')
    assert.strictEqual(errors.over(0)!.get('time').orElse(-1), 50)
    assert.strictEqual(errors.over(1)!.get('time').orElse(-1), 150)
  })

  it('ignores non-console events', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 0,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Console error',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 100,
          data: {
            level: LogLevel.Info,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Info message',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 200,
          data: {
            level: LogLevel.Warning,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Warning message',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const errors = findConsoleErrors(events)
    assert.strictEqual(
      errors.size(),
      1,
      'should return only error level logs'
    )
  })

  it('handles empty event list', () => {
    const events = new List(SourceEventView, [])

    const errors = findConsoleErrors(events)
    assert.strictEqual(
      errors.size(),
      0,
      'should return empty list for empty event list'
    )
  })

  it('preserves event order when filtering errors', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 0,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'First',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 50,
          data: {
            level: LogLevel.Info,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Middle',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 100,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Last',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const errors = findConsoleErrors(events)
    assert.strictEqual(errors.size(), 2)
    assert.strictEqual(errors.over(0)!.get('time').orElse(-1), 0)
    assert.strictEqual(errors.over(1)!.get('time').orElse(-1), 100)
  })
})
