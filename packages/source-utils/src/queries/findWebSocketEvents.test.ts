import {
  NetworkMessageType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box, List } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  findWebSocketConnections,
  findWebSocketFramesForConnection,
} from './findWebSocketEvents'

function createNetworkEvent(
  data: object,
  time: number
): Box<{
  type: SourceEventType.Network
  time: number
  data: Box<any>
}> {
  return new Box({
    type: SourceEventType.Network,
    time,
    data: new Box(data),
  })
}

describe('findWebSocketEvents', () => {
  describe('findWebSocketConnections', () => {
    it('returns empty array when no WebSocket events exist', () => {
      const events = new List(SourceEventView, [])
      const connections = findWebSocketConnections(events)
      assert.strictEqual(connections.length, 0)
    })

    it('finds a WebSocket connection from WebSocketOpen events', () => {
      const events = new List(SourceEventView, [
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketOpen,
              correlationId: 'ws1a',
              url: 'wss://example.com/socket',
            },
            0
          )
        ),
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketOutbound,
              correlationId: 'ws1a',
              messageType: 0,
              data: new ArrayBuffer(0),
            },
            20
          )
        ),
      ])

      const connections = findWebSocketConnections(events)
      assert.strictEqual(connections.length, 1)
      assert.strictEqual(connections[0]!.open.correlationId.trim(), 'ws1a')
      assert.strictEqual(connections[0]!.open.url, 'wss://example.com/socket')
    })

    it('returns multiple connections', () => {
      const events = new List(SourceEventView, [
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketOpen,
              correlationId: 'ws1a',
              url: 'wss://example.com/chat',
            },
            0
          )
        ),
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketOpen,
              correlationId: 'ws2a',
              url: 'wss://example.com/events',
            },
            100
          )
        ),
      ])

      const connections = findWebSocketConnections(events)
      assert.strictEqual(connections.length, 2)
      assert.strictEqual(connections[0]!.open.url, 'wss://example.com/chat')
      assert.strictEqual(connections[1]!.open.url, 'wss://example.com/events')
    })
  })

  describe('findWebSocketFramesForConnection', () => {
    it('returns frames for a specific connection', () => {
      const events = new List(SourceEventView, [
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketOpen,
              correlationId: 'ws1a',
              url: 'wss://example.com/socket',
            },
            0
          )
        ),
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketOutbound,
              correlationId: 'ws1a',
              messageType: 0,
              data: new ArrayBuffer(0),
            },
            10
          )
        ),
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketInbound,
              correlationId: 'ws1a',
              messageType: 0,
              data: new ArrayBuffer(0),
            },
            20
          )
        ),
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketOutbound,
              correlationId: 'ws2a',
              messageType: 0,
              data: new ArrayBuffer(0),
            },
            30
          )
        ),
      ])

      const frames = findWebSocketFramesForConnection(events, 'ws1a')
      assert.strictEqual(frames.length, 2)

      // Should be sorted by time
      assert.strictEqual(frames[0]!.time, 10)
      assert.strictEqual(frames[1]!.time, 20)
    })

    it('returns empty array when no frames exist for the connection', () => {
      const events = new List(SourceEventView, [
        SourceEventView.from(
          createNetworkEvent(
            {
              type: NetworkMessageType.WebSocketOpen,
              correlationId: 'ws1a',
              url: 'wss://example.com/socket',
            },
            0
          )
        ),
      ])

      const frames = findWebSocketFramesForConnection(events, 'ws1a')
      assert.strictEqual(frames.length, 0)
    })

    it('handles empty event list', () => {
      const events = new List(SourceEventView, [])
      const frames = findWebSocketFramesForConnection(events, 'nonexistent')
      assert.strictEqual(frames.length, 0)
    })
  })
})
