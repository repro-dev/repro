import {
  NetworkMessage,
  NetworkMessageType,
  RequestType,
  SyntheticId,
  WebSocketMessageType,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { randomString } from '@repro/random-string'
import { Box } from '@repro/tdl'
import { redactHeaders, redactUrl, redactValue } from '../redaction'

type Subscriber = (message: NetworkMessage) => void

const MAX_BODY_BYTE_LENGTH = 1_000_000
const EMPTY_ARRAY_BUFFER = new ArrayBuffer(0)

const MAX_TEXT_PAYLOAD_LENGTH = 65_536
const MAX_BINARY_PAYLOAD_LENGTH = 1_048_576

export function createNetworkObserver(
  subscriber: Subscriber
): ObserverLike<Document> {
  const xhrObserver = createXHRObserver(subscriber)
  const fetchObserver = createFetchObserver(subscriber)
  const webSocketObserver = createWebSocketObserver(subscriber)

  return {
    observe(doc, vtree) {
      xhrObserver.observe(doc, vtree)
      fetchObserver.observe(doc, vtree)
      webSocketObserver.observe(doc, vtree)
    },

    disconnect() {
      xhrObserver.disconnect()
      fetchObserver.disconnect()
      webSocketObserver.disconnect()
    },
  }
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function redactJsonBody(buffer: ArrayBuffer): ArrayBuffer {
  try {
    const text = textDecoder.decode(buffer)
    const parsed = JSON.parse(text)

    if (typeof parsed === 'object' && parsed !== null) {
      const redacted = redactValue(parsed)
      return textEncoder.encode(JSON.stringify(redacted)).buffer
    }

    return buffer
  } catch {
    return buffer
  }
}

function createXHRObserver(subscriber: Subscriber): ObserverLike<Document> {
  let isObserving = false

  const requestParams = new WeakMap<
    XMLHttpRequest,
    {
      correlationId: SyntheticId
      method: string | null
      url: string | null
      headers: Record<string, string>
    }
  >()

  function parseHeaders(rawHeaders: string | null): Record<string, string> {
    if (rawHeaders === null) {
      return {}
    }

    const entries = rawHeaders.trim().split(/[\r\n]+/)
    const headers: Record<string, string> = {}

    for (const entry of entries) {
      const parts = entry.split(': ')
      const key = parts.shift()
      const value = parts.join(': ')

      if (key) {
        headers[key.toLowerCase()] = value
      }
    }

    return headers
  }

  function handleReadyStateChange(this: XMLHttpRequest) {
    if (this.readyState !== XMLHttpRequest.DONE) {
      return
    }

    const params = requestParams.get(this)
    this.removeEventListener('readystatechange', handleReadyStateChange)
    requestParams.delete(this)
    ;(async () => {
      // Short-circuit the response event if:
      // 1. We did not capture the request phase
      // 2. Or if there has been a request error (status == 0)
      // TODO: report request errors as distinct NetworkEvent
      if (!params || this.status === 0) {
        return
      }

      let body: ArrayBuffer = EMPTY_ARRAY_BUFFER

      switch (this.responseType) {
        case 'arraybuffer':
          body = this.response
          break

        case 'blob':
          body = await this.response.arrayBuffer()
          break

        case 'document':
          body = textEncoder.encode(
            new XMLSerializer().serializeToString(this.response.documentElement)
          )
          break

        case 'json':
          body = textEncoder.encode(JSON.stringify(this.response)).buffer
          break

        case 'text':
        case '':
          body = textEncoder.encode(this.responseText).buffer
          break
      }

      subscriber(
        new Box({
          type: NetworkMessageType.FetchResponse,
          correlationId: params.correlationId,
          status: this.status,
          headers: redactHeaders(parseHeaders(this.getAllResponseHeaders())),
          body:
            body.byteLength > MAX_BODY_BYTE_LENGTH
              ? EMPTY_ARRAY_BUFFER
              : redactJsonBody(body),
        })
      )
    })()
  }

  function register(xhr: XMLHttpRequest) {
    if (!requestParams.has(xhr)) {
      const correlationId = randomString(4)

      requestParams.set(xhr, {
        correlationId,
        method: null,
        url: null,
        headers: {},
      })

      xhr.addEventListener('readystatechange', handleReadyStateChange)
    }
  }

  function setUrl(xhr: XMLHttpRequest, url: string) {
    const params = requestParams.get(xhr)

    if (params) {
      params.url = url
    }
  }

  function setMethod(xhr: XMLHttpRequest, method: string) {
    const params = requestParams.get(xhr)

    if (params) {
      params.method = method
    }
  }

  function setHeader(xhr: XMLHttpRequest, key: string, value: string) {
    const params = requestParams.get(xhr)

    if (params) {
      params.headers[key] = value
    }
  }

  const XMLHttpRequest = globalThis.XMLHttpRequest
  const XHRCtorProxy = new Proxy(XMLHttpRequest, {
    construct(target, args, newTarget) {
      const xhr = Reflect.construct(target, args, newTarget)
      register(xhr)
      return xhr
    },
  })

  const open = XMLHttpRequest.prototype.open
  const openProxy = new Proxy(XMLHttpRequest.prototype.open, {
    apply(target, thisArg, args) {
      Reflect.apply(target, thisArg, args)
      const [method, url] = args
      register(thisArg)
      setUrl(thisArg, url)
      setMethod(thisArg, method)
    },
  })

  const setRequestHeader = XMLHttpRequest.prototype.setRequestHeader
  const setRequestHeaderProxy = new Proxy(
    XMLHttpRequest.prototype.setRequestHeader,
    {
      apply(target, thisArg, args) {
        Reflect.apply(target, thisArg, args)
        const [key, value] = args
        setHeader(thisArg, key, value)
      },
    }
  )

  const send = XMLHttpRequest.prototype.send
  const sendProxy = new Proxy(XMLHttpRequest.prototype.send, {
    apply(
      target,
      thisArg: XMLHttpRequest,
      args: [Document | XMLHttpRequestBodyInit | null | undefined]
    ) {
      Reflect.apply(target, thisArg, args)
      ;(async function () {
        const params = requestParams.get(thisArg)

        if (params && params.url && params.method) {
          const [rawBody] = args

          let body = new ArrayBuffer(0)

          if (rawBody) {
            if (rawBody instanceof Document) {
              body = textEncoder.encode(
                new XMLSerializer().serializeToString(rawBody.documentElement)
              )
            } else if (rawBody instanceof ArrayBuffer) {
              body = rawBody
            } else if (rawBody instanceof Blob) {
              body = await rawBody.arrayBuffer()
            } else if (typeof rawBody === 'string') {
              body = textEncoder.encode(rawBody).buffer
            }
          }

          subscriber(
            new Box({
              type: NetworkMessageType.FetchRequest,
              correlationId: params.correlationId,
              requestType: RequestType.XHR,
              url: redactUrl(params.url),
              method: params.method,
              headers: redactHeaders(params.headers),
              body:
                body.byteLength > MAX_BODY_BYTE_LENGTH
                  ? EMPTY_ARRAY_BUFFER
                  : redactJsonBody(body),
            })
          )
        }
      })()
    },
  })

  return {
    observe() {
      if (isObserving) return
      isObserving = true

      globalThis.XMLHttpRequest = XHRCtorProxy
      globalThis.XMLHttpRequest.prototype.open = openProxy
      globalThis.XMLHttpRequest.prototype.setRequestHeader =
        setRequestHeaderProxy
      globalThis.XMLHttpRequest.prototype.send = sendProxy
    },

    disconnect() {
      isObserving = false

      globalThis.XMLHttpRequest = XMLHttpRequest
      globalThis.XMLHttpRequest.prototype.open = open
      globalThis.XMLHttpRequest.prototype.setRequestHeader = setRequestHeader
      globalThis.XMLHttpRequest.prototype.send = send
    },
  }
}

function createFetchObserver(subscriber: Subscriber): ObserverLike<Document> {
  let isObserving = false

  function createCorrelationId() {
    return randomString(4)
  }

  function createHeadersRecord(headers: Headers): Record<string, string> {
    const record: Record<string, string> = {}

    headers.forEach((value, key) => {
      record[key] = value
    })

    return redactHeaders(record)
  }

  const _fetch = globalThis.fetch

  const fetchProxy = new Proxy(globalThis.fetch, {
    apply(target, thisArg, args: [RequestInfo, RequestInit | undefined]) {
      const [requestInfo, requestInit] = args
      const correlationId = createCorrelationId()

      const req = new Request(
        requestInfo instanceof Request ? requestInfo.clone() : requestInfo,
        requestInit
      )

      req.arrayBuffer().then(
        body => {
          subscriber(
            new Box({
              type: NetworkMessageType.FetchRequest,
              correlationId,
              requestType: RequestType.Fetch,
              url: redactUrl(req.url),
              method: req.method,
              headers: createHeadersRecord(req.headers),
              body:
                body.byteLength > MAX_BODY_BYTE_LENGTH
                  ? EMPTY_ARRAY_BUFFER
                  : redactJsonBody(body),
            })
          )
        },

        // TODO: capture request errors
        _err => {}
      )

      const abortController = new AbortController()
      let abortAfterResponse = false

      function onAbort() {
        abortAfterResponse = true
      }

      requestInit?.signal?.addEventListener('abort', onAbort)

      function cleanUpAbortController() {
        requestInit?.signal?.removeEventListener('abort', onAbort)
      }

      const resP: Promise<Response> = Reflect.apply(target, thisArg, [
        requestInfo,
        {
          ...requestInit,
          signal: abortController.signal,
        },
      ])

      resP.then(
        res => {
          const resCopy = res.clone()

          resCopy.arrayBuffer().then(
            body => {
              if (abortAfterResponse) {
                abortController.abort()
                cleanUpAbortController()
              }

              subscriber(
                new Box({
                  type: NetworkMessageType.FetchResponse,
                  correlationId,
                  status: resCopy.status,
                  headers: createHeadersRecord(resCopy.headers),
                  body:
                    body.byteLength > MAX_BODY_BYTE_LENGTH
                      ? EMPTY_ARRAY_BUFFER
                      : redactJsonBody(body),
                })
              )
            },

            // TODO: capture response errors
            // If the request is aborted, reading the response body may fail
            _err => {
              cleanUpAbortController()
            }
          )
        },

        // TODO: capture response errors
        _err => {
          cleanUpAbortController()
        }
      )

      return resP
    },
  })

  return {
    observe() {
      if (isObserving) return
      isObserving = true

      globalThis.fetch = fetchProxy
    },

    disconnect() {
      isObserving = false

      globalThis.fetch = _fetch
    },
  }
}

function createWebSocketObserver(
  subscriber: Subscriber
): ObserverLike<Document> {
  let isObserving = false

  const correlationIds = new WeakMap<WebSocket, SyntheticId>()

  function hasCorrelationId(socket: WebSocket) {
    return correlationIds.has(socket)
  }

  function getOrCreateCorrelationId(socket: WebSocket): SyntheticId {
    let correlationId = correlationIds.get(socket)

    if (!correlationId) {
      correlationId = randomString(4)
      correlationIds.set(socket, correlationId)
    }

    return correlationId
  }

  const textEncoder = new TextEncoder()

  async function dataToArrayBuffer(
    data: string | ArrayBufferLike | Blob | ArrayBufferView
  ): Promise<ArrayBuffer> {
    let encodedData: ArrayBuffer

    if (typeof data === 'string') {
      encodedData = textEncoder.encode(data).buffer
    } else if (data instanceof Blob) {
      encodedData = await data.arrayBuffer()
    } else if (ArrayBuffer.isView(data)) {
      encodedData = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      )
    } else {
      encodedData = data
    }

    return encodedData
  }

  function applyTextPayloadLimit(payload: string): {
    truncated: string
    isTruncated: boolean
  } {
    if (payload.length > MAX_TEXT_PAYLOAD_LENGTH) {
      return {
        truncated: payload.slice(0, MAX_TEXT_PAYLOAD_LENGTH),
        isTruncated: true,
      }
    }
    return { truncated: payload, isTruncated: false }
  }

  function applyBinaryPayloadLimit(data: ArrayBuffer): {
    truncated: ArrayBuffer
    byteLength: number
  } {
    const isTruncated = data.byteLength > MAX_BINARY_PAYLOAD_LENGTH
    return {
      truncated: isTruncated ? data.slice(0, MAX_BINARY_PAYLOAD_LENGTH) : data,
      byteLength: data.byteLength,
    }
  }

  function handleClose(this: WebSocket) {
    if (hasCorrelationId(this)) {
      closeEffect(this)
    }
  }

  function handleError(this: WebSocket, event: Event) {
    const correlationId = getOrCreateCorrelationId(this)
    const message =
      (event as ErrorEvent).message || 'WebSocket connection error'

    subscriber(
      new Box({
        type: NetworkMessageType.WebSocketError,
        correlationId,
        message,
      })
    )
  }

  function openEffect(socket: WebSocket) {
    const correlationId = getOrCreateCorrelationId(socket)
    const url = socket.url

    socket.addEventListener('close', handleClose)
    socket.addEventListener('error', handleError)

    subscriber(
      new Box({
        type: NetworkMessageType.WebSocketOpen,
        correlationId,
        url: redactUrl(url),
      })
    )
  }

  // Event listener wrapper for WebSocket 'open' event
  function onOpen(this: WebSocket) {
    openEffect(this)
  }

  function closeEffect(socket: WebSocket) {
    const correlationId = getOrCreateCorrelationId(socket)

    subscriber(
      new Box({
        type: NetworkMessageType.WebSocketClose,
        correlationId,
      })
    )

    correlationIds.delete(socket)
    socket.removeEventListener('open', onOpen)
    socket.removeEventListener('close', handleClose)
    socket.removeEventListener('error', handleError)
  }

  async function sendEffect(
    socket: WebSocket,
    data: string | ArrayBufferLike | Blob | ArrayBufferView
  ) {
    const correlationId = getOrCreateCorrelationId(socket)

    const isBinary =
      data instanceof ArrayBuffer ||
      data instanceof Blob ||
      ArrayBuffer.isView(data)

    if (isBinary) {
      const rawData = await dataToArrayBuffer(data)
      const { truncated } = applyBinaryPayloadLimit(rawData)

      subscriber(
        new Box({
          type: NetworkMessageType.WebSocketOutbound,
          correlationId,
          messageType: WebSocketMessageType.Binary,
          data: truncated,
        })
      )
    } else {
      const rawText = typeof data === 'string' ? data : ''
      const { truncated } = applyTextPayloadLimit(rawText)
      const encoded = textEncoder.encode(truncated).buffer

      subscriber(
        new Box({
          type: NetworkMessageType.WebSocketOutbound,
          correlationId,
          messageType: WebSocketMessageType.Text,
          data: encoded,
        })
      )
    }
  }

  const messageEventObserver = createMessageEventObserver(ev => {
    ;(async function () {
      const target = ev.currentTarget

      if (target && isWebSocket(target)) {
        const correlationId = getOrCreateCorrelationId(target)
        const isBinary =
          ev.data instanceof ArrayBuffer ||
          ev.data instanceof Blob ||
          ArrayBuffer.isView(ev.data)

        if (isBinary) {
          const rawData = await dataToArrayBuffer(ev.data)
          const { truncated } = applyBinaryPayloadLimit(rawData)

          subscriber(
            new Box({
              type: NetworkMessageType.WebSocketInbound,
              correlationId,
              messageType: WebSocketMessageType.Binary,
              data: truncated,
            })
          )
        } else {
          const rawText =
            typeof ev.data === 'string'
              ? ev.data
              : new TextDecoder().decode(await dataToArrayBuffer(ev.data))
          const { truncated } = applyTextPayloadLimit(rawText)
          const encoded = textEncoder.encode(truncated).buffer

          subscriber(
            new Box({
              type: NetworkMessageType.WebSocketInbound,
              correlationId,
              messageType: WebSocketMessageType.Text,
              data: encoded,
            })
          )
        }
      }
    })()
  })

  const _WebSocket = globalThis.WebSocket

  const WebSocketCtorProxy = new Proxy(_WebSocket, {
    construct(target, args, newTarget) {
      const ws = Reflect.construct(target, args, newTarget)

      const correlationId = randomString(4)
      correlationIds.set(ws, correlationId)

      ws.addEventListener('open', onOpen)

      return ws
    },
  })

  const close = _WebSocket.prototype.close
  const send = _WebSocket.prototype.send

  return {
    observe(doc, vtree) {
      if (isObserving) return
      isObserving = true

      globalThis.WebSocket = WebSocketCtorProxy

      globalThis.WebSocket.prototype.send = function (this, ...args) {
        if (!hasCorrelationId(this)) {
          const correlationId = randomString(4)
          correlationIds.set(this, correlationId)
        }

        sendEffect(this, ...args)
        return send.apply(this, args)
      }

      globalThis.WebSocket.prototype.close = function (this, ...args) {
        if (hasCorrelationId(this)) {
          closeEffect(this)
        }

        return close.apply(this, args)
      }

      messageEventObserver.observe(doc, vtree)
    },

    disconnect() {
      isObserving = false

      globalThis.WebSocket = _WebSocket
      globalThis.WebSocket.prototype.send = send
      globalThis.WebSocket.prototype.close = close
      messageEventObserver.disconnect()
    },
  }
}

function createMessageEventObserver(
  callback: (ev: MessageEvent) => void
): ObserverLike<Document> {
  let isObserving = false

  const events = new WeakSet<MessageEvent>()

  const originalDescriptor = Object.getOwnPropertyDescriptor(
    MessageEvent.prototype,
    'data'
  )

  let newDescriptor: PropertyDescriptor | null = null

  if (originalDescriptor) {
    newDescriptor = Object.assign(
      Object.create(originalDescriptor) as PropertyDescriptor,
      {
        get(this: MessageEvent) {
          const value = originalDescriptor.get?.call(this)
          Object.defineProperty(this, 'data', { value })

          if (!events.has(this)) {
            callback(this)
            events.add(this)
          }

          return value
        },
      }
    )
  }

  return {
    observe() {
      if (isObserving) return
      isObserving = true

      if (newDescriptor) {
        Object.defineProperty(MessageEvent.prototype, 'data', newDescriptor)
      }
    },

    disconnect() {
      isObserving = false

      if (originalDescriptor) {
        Object.defineProperty(
          MessageEvent.prototype,
          'data',
          originalDescriptor
        )
      }
    },
  }
}

function isWebSocket(target: EventTarget): target is WebSocket {
  return target instanceof WebSocket
}
