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
import { findNetworkErrors } from './findNetworkErrors'

describe('findNetworkErrors', () => {
  it('returns empty array when no network errors are present', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 0,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: '1234',
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
          time: 100,
          data: new Box({
            type: NetworkMessageType.FetchResponse,
            correlationId: '1234',
            status: 200,
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
    ])

    const errors = findNetworkErrors(events)
    assert.strictEqual(
      errors.length,
      0,
      'should return empty array for successful responses'
    )
  })

  it('filters and returns only fetch groups with 4xx/5xx status codes', () => {
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
                value: 'Console message',
              }),
            ],
            stack: [],
          },
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 10,
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
          time: 50,
          data: new Box({
            type: NetworkMessageType.FetchResponse,
            correlationId: 'req1',
            status: 200,
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 100,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: 'req2',
            requestType: RequestType.Fetch,
            url: 'https://example.com/notfound',
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
            correlationId: 'req2',
            status: 404,
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 200,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: 'req3',
            requestType: RequestType.Fetch,
            url: 'https://example.com/error',
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
            correlationId: 'req3',
            status: 500,
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
    ])

    const errors = findNetworkErrors(events)
    assert.strictEqual(errors.length, 2, 'should return only 4xx/5xx errors')
    assert.strictEqual(errors[0]!.response!.status, 404)
    assert.strictEqual(errors[1]!.response!.status, 500)
  })

  it('ignores websocket groups and non-error responses', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 0,
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
          time: 100,
          data: new Box({
            type: NetworkMessageType.WebSocketOutbound,
            correlationId: 'ws1',
            messageType: 0,
            data: new ArrayBuffer(0),
          }),
        })
      ),
      SourceEventView.from(
        new Box({
          type: SourceEventType.Network,
          time: 200,
          data: new Box({
            type: NetworkMessageType.FetchRequest,
            correlationId: 'req1',
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
          time: 300,
          data: new Box({
            type: NetworkMessageType.FetchResponse,
            correlationId: 'req1',
            status: 201,
            headers: {},
            body: new ArrayBuffer(0),
          }),
        })
      ),
    ])

    const errors = findNetworkErrors(events)
    assert.strictEqual(
      errors.length,
      0,
      'should ignore websocket groups and successful responses'
    )
  })

  it('handles empty event list', () => {
    const events = new List(SourceEventView, [])

    const errors = findNetworkErrors(events)
    assert.strictEqual(
      errors.length,
      0,
      'should return empty array for empty event list'
    )
  })
})
