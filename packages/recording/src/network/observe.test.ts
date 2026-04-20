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
import { afterEach, describe, it } from 'node:test'
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
})
