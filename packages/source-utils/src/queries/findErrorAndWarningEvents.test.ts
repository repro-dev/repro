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
import { findErrorAndWarningEvents } from './findErrorAndWarningEvents'

describe('findErrorAndWarningEvents', () => {
  it('returns empty array when no errors or warnings are present', () => {
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
          type: SourceEventType.Network,
          time: 100,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: 'req1',
            requestType: RequestType.Fetch,
            url: 'https://example.com/success',
            method: 'GET',
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 150,
          data: new Box({
            type: NetworkMessageType.FetchResponse,
            correlationId: 'req1',
            status: 200,
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 0, 'should return empty array')
  })

  it('detects console.error events', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 50,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'TypeError: something broke',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 1)
    assert.strictEqual(entries[0]!.time, 50)
    assert.strictEqual(entries[0]!.severity, 'error')
    assert.strictEqual(entries[0]!.category, 'console')
    assert.ok(entries[0]!.summary.includes('TypeError'))
  })

  it('detects console.warn events', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 75,
          data: {
            level: LogLevel.Warning,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Deprecated API used',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 1)
    assert.strictEqual(entries[0]!.time, 75)
    assert.strictEqual(entries[0]!.severity, 'warning')
    assert.strictEqual(entries[0]!.category, 'console')
    assert.ok(entries[0]!.summary.includes('Deprecated API'))
  })

  it('detects network fetch errors (status >= 400)', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 100,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: 'req1',
            requestType: RequestType.Fetch,
            url: 'https://example.com/api',
            method: 'POST',
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 250,
          data: new Box({
            type: NetworkMessageType.FetchResponse,
            correlationId: 'req1',
            status: 500,
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 1)
    assert.strictEqual(entries[0]!.severity, 'error')
    assert.strictEqual(entries[0]!.category, 'network')
    assert.ok(entries[0]!.summary.includes('500'))
  })

  it('detects WebSocket errors', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 50,
          data: new Box({
            type: NetworkMessageType.WebSocketOpen,
            correlationId: 'ws1',
            url: 'wss://example.com/socket',
          }),
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 200,
          data: new Box({
            type: NetworkMessageType.WebSocketError,
            correlationId: 'ws1',
            message: 'Connection refused',
          }),
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 1)
    assert.strictEqual(entries[0]!.severity, 'error')
    assert.strictEqual(entries[0]!.category, 'network')
    assert.ok(entries[0]!.summary.includes('WebSocket'))
  })

  it('handles mixed events: errors, warnings, and non-errors', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 10,
          data: {
            level: LogLevel.Info,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Info',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 20,
          data: {
            level: LogLevel.Warning,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Warning msg',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 30,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Error msg',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 2)
    assert.strictEqual(entries[0]!.severity, 'warning')
    assert.strictEqual(entries[1]!.severity, 'error')
  })

  it('returns entries sorted by time', () => {
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
                value: 'Late error',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 25,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Early error',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 2)
    assert.strictEqual(entries[0]!.time, 25)
    assert.strictEqual(entries[1]!.time, 100)
  })

  it('handles empty event list', () => {
    const events = new List(SourceEventView, [])
    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 0)
  })

  it('includes summary text for console errors', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 50,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Uncaught',
              }),
              new Box({
                type: MessagePartType.String,
                value: 'TypeError:',
              }),
              new Box({
                type: MessagePartType.String,
                value: 'x',
              }),
              new Box({
                type: MessagePartType.String,
                value: 'is',
              }),
              new Box({
                type: MessagePartType.String,
                value: 'undefined',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    assert.strictEqual(entries.length, 1)
    assert.strictEqual(
      entries[0]!.summary,
      'Uncaught TypeError: x is undefined'
    )
  })
})
