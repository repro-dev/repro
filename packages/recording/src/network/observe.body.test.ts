import {
  NetworkMessageType,
  NodeType,
  RequestType,
  type NetworkMessage,
  type VTree,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { Box } from '@repro/tdl'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { MASKED_VALUE } from '../redaction'
import { createNetworkObserver } from './observe'

type Transport = 'Fetch' | 'XHR'

interface RecordedMessage {
  type: NetworkMessageType
  requestType?: RequestType
  body: ArrayBuffer
}

class BodyMockXHR {
  static DONE = 4

  readyState = 0
  status = 200
  responseType = ''
  responseText = ''
  response: string | ArrayBuffer = ''
  private listeners = new Set<(this: BodyMockXHR) => void>()

  addEventListener(event: string, listener: (this: BodyMockXHR) => void) {
    if (event === 'readystatechange') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(event: string, listener: (this: BodyMockXHR) => void) {
    if (event === 'readystatechange') {
      this.listeners.delete(listener)
    }
  }

  open(_method: string, _url: string) {}

  setRequestHeader(_key: string, _value: string) {}

  getAllResponseHeaders() {
    return 'content-type: application/json'
  }

  send(_body?: Document | XMLHttpRequestBodyInit | null) {
    this.readyState = BodyMockXHR.DONE
    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener.call(this)
      }
    })
  }
}

const vtree: VTree = {
  rootId: 'body-root',
  nodes: {
    'body-root': new Box({
      id: 'body-root',
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

function encodeBody(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer
}

function messageValue(message: NetworkMessage): RecordedMessage {
  return (message as unknown as Box<RecordedMessage>).unwrap()
}

function getMessage(
  messages: Array<NetworkMessage>,
  type: NetworkMessageType
): RecordedMessage {
  const message = messages.find(
    candidate => messageValue(candidate).type === type
  )
  assert.ok(message, `Expected a ${type} message`)
  return messageValue(message)
}

function bodyBytes(body: ArrayBuffer): Array<number> {
  return Array.from(new Uint8Array(body))
}

function bodyMatches(body: ArrayBuffer, expected: string): boolean {
  return Buffer.from(body).equals(Buffer.from(expected))
}

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function captureBodies(
  transport: Transport,
  requestBody: string | ArrayBuffer,
  responseBody: string | ArrayBuffer
): Promise<Array<NetworkMessage>> {
  const messages: Array<NetworkMessage> = []

  if (transport === 'Fetch') {
    global.fetch = (async () =>
      new Response(responseBody, { status: 200 })) as typeof fetch
  } else {
    global.XMLHttpRequest = BodyMockXHR as unknown as typeof XMLHttpRequest
  }

  observer = createNetworkObserver(message => {
    messages.push(message)
  })
  observer.observe(document, vtree)

  if (transport === 'Fetch') {
    await fetch('https://example.test/body', {
      method: 'POST',
      body: requestBody,
    })
  } else {
    const xhr = new XMLHttpRequest() as unknown as BodyMockXHR
    xhr.responseType =
      responseBody instanceof ArrayBuffer ? 'arraybuffer' : 'text'
    xhr.response = responseBody
    xhr.responseText = typeof responseBody === 'string' ? responseBody : ''
    xhr.open('POST', 'https://example.test/body')
    xhr.send(requestBody)
  }

  await flush()
  return messages
}

describe('network observer HTTP body capture', () => {
  for (const transport of ['Fetch', 'XHR'] as const) {
    for (const byteLength of [1_000_000, 1_000_001] as const) {
      it(`${transport} records request and response bodies of ${byteLength} bytes according to the cutoff`, async () => {
        const body = 'x'.repeat(byteLength)
        const messages = await captureBodies(transport, body, body)
        const request = getMessage(messages, NetworkMessageType.FetchRequest)
        const response = getMessage(messages, NetworkMessageType.FetchResponse)
        const expectedBody = byteLength === 1_000_000 ? body : ''

        assert.equal(
          request.requestType,
          transport === 'Fetch' ? RequestType.Fetch : RequestType.XHR
        )
        assert.equal(
          request.body.byteLength,
          byteLength === 1_000_000 ? byteLength : 0
        )
        assert.equal(
          response.body.byteLength,
          byteLength === 1_000_000 ? byteLength : 0
        )
        assert.ok(
          bodyMatches(request.body, expectedBody),
          'Request body bytes should match the captured payload'
        )
        assert.ok(
          bodyMatches(response.body, expectedBody),
          'Response body bytes should match the captured payload'
        )
      })
    }

    it(`${transport} redacts sensitive keys and PII values in JSON object and array bodies`, async () => {
      const requestBody = JSON.stringify({
        password: 'plain-text-secret',
        contact: 'person@example.test',
        keep: 'public value',
      })
      const responseBody = JSON.stringify([
        { token: 'array-token', keep: 'public value' },
        'another@example.test',
      ])
      const messages = await captureBodies(transport, requestBody, responseBody)
      const request = getMessage(messages, NetworkMessageType.FetchRequest)
      const response = getMessage(messages, NetworkMessageType.FetchResponse)

      assert.deepEqual(JSON.parse(new TextDecoder().decode(request.body)), {
        password: MASKED_VALUE,
        contact: MASKED_VALUE,
        keep: 'public value',
      })
      assert.deepEqual(JSON.parse(new TextDecoder().decode(response.body)), [
        { token: MASKED_VALUE, keep: 'public value' },
        MASKED_VALUE,
      ])
    })

    const unchangedBodies: Array<{
      name: string
      body: string | ArrayBuffer
    }> = [
      {
        name: 'scalar JSON',
        body: JSON.stringify('person@example.test'),
      },
      {
        name: 'non-JSON text',
        body: 'contact=person@example.test',
      },
      {
        name: 'binary data',
        body: Uint8Array.from([0, 255, 1, 128]).buffer as ArrayBuffer,
      },
    ]

    for (const { name, body } of unchangedBodies) {
      it(`${transport} preserves ${name} request and response bodies unchanged`, async () => {
        const messages = await captureBodies(transport, body, body)
        const request = getMessage(messages, NetworkMessageType.FetchRequest)
        const response = getMessage(messages, NetworkMessageType.FetchResponse)
        const expected = body instanceof ArrayBuffer ? body : encodeBody(body)

        assert.deepEqual(bodyBytes(request.body), bodyBytes(expected))
        assert.deepEqual(bodyBytes(response.body), bodyBytes(expected))
      })
    }
  }
})
