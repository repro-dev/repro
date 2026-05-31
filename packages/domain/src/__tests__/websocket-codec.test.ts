import { Box } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  NetworkMessageType,
  NetworkMessageView,
  WebSocketCreatedView,
  WebSocketErrorView,
  WebSocketInboundView,
  WebSocketMessageType,
} from '../../generated/network'

describe('WebSocket codec round-trip', () => {
  it('encodes and decodes WebSocketCreated', () => {
    const original = {
      type: NetworkMessageType.WebSocketCreated as const,
      correlationId: 'abcd',
      url: 'wss://example.com/socket',
      protocols: null as string | null,
    }

    const encoded = WebSocketCreatedView.encode(original)
    const decoded = WebSocketCreatedView.decode(encoded)

    assert.deepStrictEqual(decoded, original)
  })

  it('encodes and decodes WebSocketCreated with protocols', () => {
    const original = {
      type: NetworkMessageType.WebSocketCreated as const,
      correlationId: 'efgh',
      url: 'wss://chat.example.com',
      protocols: 'chat-protocol',
    }

    const encoded = WebSocketCreatedView.encode(original)
    const decoded = WebSocketCreatedView.decode(encoded)

    assert.deepStrictEqual(decoded, original)
  })

  it('encodes and decodes WebSocketError', () => {
    const original = {
      type: NetworkMessageType.WebSocketError as const,
      correlationId: 'ijkl',
      message: 'Connection refused',
    }

    const encoded = WebSocketErrorView.encode(original)
    const decoded = WebSocketErrorView.decode(encoded)

    assert.deepStrictEqual(decoded, original)
  })

  it('encodes and decodes WebSocketInbound with preview', () => {
    const encoder = new TextEncoder()
    const original = {
      type: NetworkMessageType.WebSocketInbound as const,
      correlationId: 'mnop',
      messageType: WebSocketMessageType.Text,
      data: encoder.encode('hello world').buffer as ArrayBuffer,
      preview: 'hello world',
    }

    const encoded = WebSocketInboundView.encode(original)
    const decoded = WebSocketInboundView.decode(encoded)

    assert.strictEqual(decoded.type, original.type)
    assert.strictEqual(decoded.correlationId, original.correlationId)
    assert.strictEqual(decoded.messageType, original.messageType)
    assert.strictEqual(decoded.preview, original.preview)
    assert.deepStrictEqual(
      new Uint8Array(decoded.data),
      new Uint8Array(original.data)
    )
  })

  it('encodes and decodes WebSocketInbound with null preview', () => {
    const original = {
      type: NetworkMessageType.WebSocketInbound as const,
      correlationId: 'qrst',
      messageType: WebSocketMessageType.Binary,
      data: new ArrayBuffer(0),
      preview: null as string | null,
    }

    const encoded = WebSocketInboundView.encode(original)
    const decoded = WebSocketInboundView.decode(encoded)

    assert.strictEqual(decoded.preview, null)
  })

  it('round-trips through NetworkMessageView union for WebSocketCreated', () => {
    const original = new Box({
      type: NetworkMessageType.WebSocketCreated as const,
      correlationId: 'abcd',
      url: 'wss://example.com/socket',
      protocols: null,
    })

    const encoded = NetworkMessageView.encode(original)
    const decoded = NetworkMessageView.decode(encoded)

    decoded.apply(decoded => {
      assert.strictEqual(decoded.type, NetworkMessageType.WebSocketCreated)
      if (decoded.type === NetworkMessageType.WebSocketCreated) {
        assert.strictEqual(decoded.correlationId, 'abcd')
        assert.strictEqual(decoded.url, 'wss://example.com/socket')
        assert.strictEqual(decoded.protocols, null)
      }
    })
  })

  it('round-trips through NetworkMessageView union for WebSocketError', () => {
    const original = new Box({
      type: NetworkMessageType.WebSocketError as const,
      correlationId: 'efgh',
      message: 'Connection timeout',
    })

    const encoded = NetworkMessageView.encode(original)
    const decoded = NetworkMessageView.decode(encoded)

    decoded.apply(decoded => {
      assert.strictEqual(decoded.type, NetworkMessageType.WebSocketError)
      if (decoded.type === NetworkMessageType.WebSocketError) {
        assert.strictEqual(decoded.message, 'Connection timeout')
      }
    })
  })
})
