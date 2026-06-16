/**
 * @jest-environment jsdom
 */

import {
  NetworkMessage,
  NetworkMessageType,
  NodeType,
  RequestType,
  VTree,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { Box } from '@repro/tdl'
import expect from 'expect'
import { afterEach, before, describe, it } from 'node:test'
import { MASKED_VALUE } from '../redaction'
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

  send(_body?: Document | XMLHttpRequestBodyInit | null) {
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

    it('captures WebSocket error events', async () => {
      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      const mockWs = new (globalThis.WebSocket as any)(
        'wss://example.com/socket'
      ) as unknown as MockWebSocket

      await flush()

      // open event triggers openEffect which registers the error listener
      mockWs.dispatchEvent(new Event('open'))

      await flush()

      mockWs.dispatchEvent(
        new ErrorEvent('error', { message: 'Connection refused' })
      )

      await flush()

      const errorMsg = messages.find((m: any) => {
        return m.value.type === NetworkMessageType.WebSocketError
      }) as any

      expect(errorMsg).toBeDefined()
      expect(errorMsg.value.message).toBe('Connection refused')
    })
  })

  describe('JSON body redaction', () => {
    it('redacts sensitive keys in XHR request body', async () => {
      global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest

      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      const xhr = new XMLHttpRequest() as unknown as MockXHR
      xhr.open('POST', 'https://example.text/xhr')
      xhr.send(JSON.stringify({ password: 's3cret', name: 'test' }))

      await flush()

      expect(messages.length).toBeGreaterThanOrEqual(1)

      const bodyText = new TextDecoder().decode((messages[0] as any).value.body)
      const parsedBody = JSON.parse(bodyText)
      expect(parsedBody.password).toBe(MASKED_VALUE)
      expect(parsedBody.name).toBe('test')
    })

    it('redacts sensitive keys in XHR response body', async () => {
      global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest

      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      const xhr = new XMLHttpRequest() as unknown as MockXHR
      xhr.responseType = 'text'
      xhr.responseText = JSON.stringify({ token: 'abc123', data: 'ok' })
      xhr.open('POST', 'https://example.text/xhr')
      xhr.send()

      await flush()

      expect(messages).toHaveLength(2)

      const bodyText = new TextDecoder().decode((messages[1] as any).value.body)
      const parsedBody = JSON.parse(bodyText)
      expect(parsedBody.token).toBe(MASKED_VALUE)
      expect(parsedBody.data).toBe('ok')
    })

    it('passes non-JSON XHR body through unmodified', async () => {
      global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest

      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      const xhr = new XMLHttpRequest() as unknown as MockXHR
      xhr.open('POST', 'https://example.text/xhr')
      xhr.send('plain text not json')

      await flush()

      expect(messages.length).toBeGreaterThanOrEqual(1)

      const bodyText = new TextDecoder().decode((messages[0] as any).value.body)
      expect(bodyText).toBe('plain text not json')
    })

    it('redacts sensitive keys in Fetch request body', async () => {
      global.fetch = (async () =>
        new Response('ok', {
          status: 200,
        })) as typeof fetch

      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      await fetch('https://example.text/fetch', {
        method: 'POST',
        body: JSON.stringify({ apiKey: 'key123', public: 'data' }),
        headers: { 'Content-Type': 'application/json' },
      })

      await flush()

      expect(messages).toHaveLength(2)

      const bodyText = new TextDecoder().decode((messages[0] as any).value.body)
      const parsedBody = JSON.parse(bodyText)
      expect(parsedBody.apiKey).toBe(MASKED_VALUE)
      expect(parsedBody.public).toBe('data')
    })

    it('redacts sensitive keys in Fetch response body', async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({ secret: 'val', ok: true }), {
          status: 200,
        })) as typeof fetch

      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      await fetch('https://example.text/fetch', {
        method: 'GET',
      })

      await flush()

      expect(messages).toHaveLength(2)

      const bodyText = new TextDecoder().decode((messages[1] as any).value.body)
      const parsedBody = JSON.parse(bodyText)
      expect(parsedBody.secret).toBe(MASKED_VALUE)
      expect(parsedBody.ok).toBe(true)
    })

    it('passes empty ArrayBuffer through redactJsonBody unchanged', async () => {
      global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest

      const messages: Array<NetworkMessage> = []

      observer = createNetworkObserver(message => {
        messages.push(message)
      })
      observer.observe(document, vtree)

      const xhr = new XMLHttpRequest() as unknown as MockXHR
      xhr.responseType = 'text'
      xhr.responseText = ''
      xhr.open('POST', 'https://example.text/xhr')
      xhr.send()

      await flush()

      expect(messages).toHaveLength(2)

      // Empty response body should remain empty (0-length ArrayBuffer)
      expect((messages[1] as any).value.body.byteLength).toBe(0)
    })
  })
})
