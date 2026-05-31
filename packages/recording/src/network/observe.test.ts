/**
 * @jest-environment jsdom
 */

import {
  NetworkMessage,
  NetworkMessageType,
  NodeType,
  RequestType,
  VTree,
  WebSocketMessageType,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { Box } from '@repro/tdl'
import expect from 'expect'
import { afterEach, before, describe, it } from 'node:test'
import { createNetworkObserver } from './observe'

class MockXHR {
  static DONE = 4

  readyState = 0
  status = 200
  responseType = ''
  responseText = 'response-body'
  response = 'response-body'
  method = ''
  url = ''
  requestHeaders: Record<string, string> = {}
  responseHeaders = ''
  private listeners = new Set<(this: MockXHR) => void>()

  addEventListener(event: string, listener: (this: MockXHR) => void) {
    if (event === 'readystatechange') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(event: string, listener: (this: MockXHR) => void) {
    if (event === 'readystatechange') {
      this.listeners.delete(listener)
    }
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(key: string, value: string) {
    this.requestHeaders[key] = value
  }

  getAllResponseHeaders() {
    return this.responseHeaders
  }

  send() {
    this.readyState = MockXHR.DONE

    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener.call(this)
      }
    })
  }
}

describe('libs/record: network observers', () => {
  const vtree: VTree = {
    rootId: 'foo',
    nodes: {
      foo: new Box({
        id: 'foo',
        parentId: null,
        type: NodeType.Document,
        children: [],
      }),
    },
  }

  let observer: ObserverLike | null = null
  const originalXMLHttpRequest = global.XMLHttpRequest
  const originalFetch = global.fetch

  afterEach(() => {
    observer?.disconnect()
    observer = null

    global.XMLHttpRequest = originalXMLHttpRequest
    global.fetch = originalFetch
  })

  function flush() {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  it('masks credential headers on XHR requests and responses', async () => {
    global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest

    const messages: Array<NetworkMessage> = []

    observer = createNetworkObserver(message => {
      messages.push(message)
    })
    observer.observe(document, vtree)

    const xhr = new XMLHttpRequest() as unknown as MockXHR
    xhr.responseHeaders = [
      'Content-Type: text/plain',
      'Authorization: bearer response-token',
      'Cookie: response-cookie',
      'Set-Cookie: response-set-cookie',
    ].join('\r\n')

    xhr.open('POST', 'https://example.text/xhr')
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('Content-Encoding', 'gzip')
    xhr.setRequestHeader('Cookie', 'request-cookie')
    xhr.setRequestHeader('Authorization', 'request-token')
    xhr.send()

    await flush()

    expect(messages).toHaveLength(2)

    expect((messages[0] as any).value).toMatchObject({
      type: NetworkMessageType.FetchRequest,
      requestType: RequestType.XHR,
      method: 'POST',
      url: 'https://example.text/xhr',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        Cookie: '[MASKED]',
        Authorization: '[MASKED]',
      },
    })

    expect((messages[1] as any).value).toMatchObject({
      type: NetworkMessageType.FetchResponse,
      status: 200,
      headers: {
        'content-type': 'text/plain',
        authorization: '[MASKED]',
        cookie: '[MASKED]',
        'set-cookie': '[MASKED]',
      },
    })
  })

  it('masks credential headers on fetch requests and responses', async () => {
    global.fetch = (async () =>
      new Response('response-body', {
        status: 201,
        headers: {
          'Content-Type': 'text/plain',
          Authorization: 'response-token',
          Cookie: 'response-cookie',
          'Set-Cookie': 'response-set-cookie',
        },
      })) as typeof fetch

    const messages: Array<NetworkMessage> = []

    observer = createNetworkObserver(message => {
      messages.push(message)
    })
    observer.observe(document, vtree)

    await fetch('https://example.text/fetch', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'request-token',
        Cookie: 'request-cookie',
      },
    })

    await flush()

    expect(messages).toHaveLength(2)

    expect((messages[0] as any).value).toMatchObject({
      type: NetworkMessageType.FetchRequest,
      requestType: RequestType.Fetch,
      method: 'POST',
      url: 'https://example.text/fetch',
      headers: {
        'content-type': 'application/json',
        authorization: '[MASKED]',
        cookie: '[MASKED]',
      },
    })

    expect((messages[1] as any).value).toMatchObject({
      type: NetworkMessageType.FetchResponse,
      status: 201,
      headers: {
        'content-type': 'text/plain',
        authorization: '[MASKED]',
        cookie: '[MASKED]',
        'set-cookie': '[MASKED]',
      },
    })
  })

  describe('WebSocket observer', () => {
    class MockWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3

      readyState: number = MockWebSocket.CONNECTING
      url: string
      private listeners = new Map<string, Set<Function>>()

      constructor(url: string, _protocols?: string | string[]) {
        this.url = url
      }

      addEventListener(event: string, listener: Function) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, new Set())
        }
        this.listeners.get(event)!.add(listener)
      }

      removeEventListener(event: string, listener: Function) {
        this.listeners.get(event)?.delete(listener)
      }

      send(_data: string | ArrayBufferLike | Blob | ArrayBufferView) {}

      close() {
        this.readyState = MockWebSocket.CLOSED
        this.dispatchEvent(new Event('close'))
      }

      dispatchEvent(event: Event): boolean {
        const handlers = this.listeners.get(event.type)
        if (handlers) {
          for (const handler of handlers) {
            handler.call(this, event)
          }
        }
        return true
      }
    }

    let originalWebSocket: typeof globalThis.WebSocket

    before(() => {
      originalWebSocket = globalThis.WebSocket
      globalThis.WebSocket =
        MockWebSocket as unknown as typeof globalThis.WebSocket
    })

    afterEach(() => {
      globalThis.WebSocket = originalWebSocket
      observer?.disconnect()
      observer = null
    })

    it('emits WebSocketCreated at construction time', async () => {
      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      new (globalThis.WebSocket as any)(
        'wss://example.com/socket'
      ) as unknown as MockWebSocket

      await flush()

      expect(messages.length).toBeGreaterThanOrEqual(1)

      const firstMsg = messages[0] as any
      expect(firstMsg.value.type).toBe(NetworkMessageType.WebSocketCreated)
      expect(firstMsg.value.url).toBe('wss://example.com/socket')
      expect(firstMsg.value.protocols).toBe(null)
    })

    it('emits WebSocketCreated with protocols when provided as string', async () => {
      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      new (globalThis.WebSocket as any)(
        'wss://example.com/socket',
        'chat-protocol'
      ) as unknown as MockWebSocket

      await flush()

      const firstMsg = messages[0] as any
      expect(firstMsg.value.type).toBe(NetworkMessageType.WebSocketCreated)
      expect(firstMsg.value.protocols).toBe('chat-protocol')
    })

    it('tracks text truncation via config', async () => {
      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(
        message => {
          messages.push(message)
        },
        {
          maxTextPayloadLength: 10,
          maxBinaryPayloadLength: 1_048_576,
          redactTextPayloads: false,
          captureBinaryPreview: true,
          captureTextPreview: true,
          binaryPreviewLength: 256,
        }
      )
      observer.observe(document, vtree)

      const mockWs = new (globalThis.WebSocket as any)(
        'wss://example.com/socket'
      ) as unknown as MockWebSocket

      await flush()
      messages.length = 0

      mockWs.send('This is a long text payload that should be truncated')

      await flush()

      const wsMessages = messages.filter((m: any) => {
        const t = m.value.type
        return (
          t === NetworkMessageType.WebSocketOutbound ||
          t === NetworkMessageType.WebSocketInbound
        )
      })

      expect(wsMessages.length).toBe(1)
      const outbound = wsMessages[0] as any
      expect(outbound.value.messageType).toBe(WebSocketMessageType.Text)

      const decoder = new TextDecoder()
      const decoded = decoder.decode(outbound.value.data)
      expect(decoded.length).toBeLessThanOrEqual(10)
      expect(decoded).toBe('This is a ')
    })

    it('applies redaction to text payloads', async () => {
      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(
        message => {
          messages.push(message)
        },
        {
          maxTextPayloadLength: 10000,
          maxBinaryPayloadLength: 1_048_576,
          redactTextPayloads: true,
          captureBinaryPreview: true,
          captureTextPreview: true,
          binaryPreviewLength: 256,
        }
      )
      observer.observe(document, vtree)

      const ws = new (globalThis.WebSocket as any)(
        'wss://example.com/socket'
      ) as unknown as MockWebSocket

      await flush()
      messages.length = 0

      ws.send(
        JSON.stringify({
          username: 'john',
          password: 'super-secret-123',
          data: 'hello',
        })
      )

      await flush()

      const outbound = messages.find((m: any) => {
        const t = m.value.type
        return t === NetworkMessageType.WebSocketOutbound
      }) as any

      expect(outbound).toBeDefined()

      const decoder = new TextDecoder()
      const decoded = decoder.decode(outbound.value.data)
      const parsed = JSON.parse(decoded)

      expect(parsed.password).toBe('[MASKED]')
      expect(parsed.username).toBe('john')
      expect(parsed.data).toBe('hello')
    })

    it('truncates binary payloads', async () => {
      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(
        message => {
          messages.push(message)
        },
        {
          maxTextPayloadLength: 65_536,
          maxBinaryPayloadLength: 5,
          redactTextPayloads: false,
          captureBinaryPreview: false,
          captureTextPreview: true,
          binaryPreviewLength: 256,
        }
      )
      observer.observe(document, vtree)

      const ws = new (globalThis.WebSocket as any)(
        'wss://example.com/socket'
      ) as unknown as MockWebSocket

      await flush()
      messages.length = 0

      const largeBuffer = new ArrayBuffer(100)
      new Uint8Array(largeBuffer).set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      ws.send(largeBuffer)

      await flush()

      const outbound = messages.find((m: any) => {
        const t = m.value.type
        return t === NetworkMessageType.WebSocketOutbound
      }) as any

      expect(outbound).toBeDefined()
      expect(outbound.value.data.byteLength).toBeLessThanOrEqual(5)
    })
  })
})
