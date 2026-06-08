import { Box } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  NetworkMessageType,
  NetworkMessageView,
  WebSocketErrorView,
  WebSocketInboundView,
  WebSocketMessageType,
} from '../../generated/network'

describe('WebSocket codec round-trip', () => {
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

  it('encodes and decodes WebSocketInbound', () => {
    const encoder = new TextEncoder()
    const original = {
      type: NetworkMessageType.WebSocketInbound as const,
      correlationId: 'mnop',
      messageType: WebSocketMessageType.Text,
      data: encoder.encode('hello world').buffer as ArrayBuffer,
    }

    const encoded = WebSocketInboundView.encode(original)
    const decoded = WebSocketInboundView.decode(encoded)

    assert.strictEqual(decoded.type, original.type)
    assert.strictEqual(decoded.correlationId, original.correlationId)
    assert.strictEqual(decoded.messageType, original.messageType)
    assert.deepStrictEqual(
      new Uint8Array(decoded.data),
      new Uint8Array(original.data)
    )
  })

  it('encodes and decodes WebSocketInbound with binary data', () => {
    const original = {
      type: NetworkMessageType.WebSocketInbound as const,
      correlationId: 'qrst',
      messageType: WebSocketMessageType.Binary,
      data: new ArrayBuffer(0),
    }

    const encoded = WebSocketInboundView.encode(original)
    const decoded = WebSocketInboundView.decode(encoded)

    assert.strictEqual(decoded.messageType, WebSocketMessageType.Binary)
    assert.strictEqual(decoded.data.byteLength, 0)
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
