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
import { redactHeaders, redactTextPayload } from '../redaction'
import { WebSocketRecordingConfig } from '../types'

type Subscriber = (message: NetworkMessage) => void

const MAX_BODY_BYTE_LENGTH = 1_000_000
const EMPTY_ARRAY_BUFFER = new ArrayBuffer(0)

const DEFAULT_WS_CONFIG: WebSocketRecordingConfig = {
  maxTextPayloadLength: 65_536,
  maxBinaryPayloadLength: 1_048_576,
  redactTextPayloads: false,
  captureBinaryPreview: true,
  captureTextPreview: true,
  binaryPreviewLength: 256,
}

export function createNetworkObserver(
  subscriber: Subscriber,
  wsConfig?: WebSocketRecordingConfig
): ObserverLike<Document> {
  const config = { ...DEFAULT_WS_CONFIG, ...wsConfig }
  const xhrObserver = createXHRObserver(subscriber)
  const fetchObserver = createFetchObserver(subscriber)
  const webSocketObserver = createWebSocketObserver(subscriber, config)

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

function createXHRObserver(subscriber: Subscriber): ObserverLike<Document> {
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
            body.byteLength > MAX_BODY_BYTE_LENGTH ? EMPTY_ARRAY_BUFFER : body,
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
              url: params.url,
              method: params.method,
              headers: redactHeaders(params.headers),
              body:
                body.byteLength > MAX_BODY_BYTE_LENGTH
                  ? EMPTY_ARRAY_BUFFER
                  : body,
            })
          )
        }
      })()
    },
  })

  return {
    observe() {
      globalThis.XMLHttpRequest = XHRCtorProxy
      globalThis.XMLHttpRequest.prototype.open = openProxy
      globalThis.XMLHttpRequest.prototype.setRequestHeader =
        setRequestHeaderProxy
      globalThis.XMLHttpRequest.prototype.send = sendProxy
    },

    disconnect() {
      globalThis.XMLHttpRequest = XMLHttpRequest
      globalThis.XMLHttpRequest.prototype.open = open
      globalThis.XMLHttpRequest.prototype.setRequestHeader = setRequestHeader
      globalThis.XMLHttpRequest.prototype.send = send
    },
  }
}

function createFetchObserver(subscriber: Subscriber): ObserverLike<Document> {
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
              url: req.url,
              method: req.method,
              headers: createHeadersRecord(req.headers),
              body:
                body.byteLength > MAX_BODY_BYTE_LENGTH
                  ? EMPTY_ARRAY_BUFFER
                  : body,
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
                      : body,
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
      globalThis.fetch = fetchProxy
    },

    disconnect() {
      globalThis.fetch = _fetch
    },
  }
}

interface ConnectionMeta {
  correlationId: SyntheticId
  url: string
  messageCountSent: number
  messageCountReceived: number
  createdAt: number
  handshakeCompleted: boolean
}

function createWebSocketObserver(
  subscriber: Subscriber,
  config: WebSocketRecordingConfig
): ObserverLike<Document> {
  const correlationIds = new WeakMap<WebSocket, SyntheticId>()
  const connectionMeta = new WeakMap<WebSocket, ConnectionMeta>()

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

  function getConnectionMeta(socket: WebSocket): ConnectionMeta | undefined {
    return connectionMeta.get(socket)
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
    if (payload.length > config.maxTextPayloadLength) {
      return {
        truncated: payload.slice(0, config.maxTextPayloadLength),
        isTruncated: true,
      }
    }
    return { truncated: payload, isTruncated: false }
  }

  function applyBinaryPayloadLimit(data: ArrayBuffer): {
    truncated: ArrayBuffer
    byteLength: number
  } {
    const isTruncated = data.byteLength > config.maxBinaryPayloadLength
    return {
      truncated: isTruncated
        ? data.slice(0, config.maxBinaryPayloadLength)
        : data,
      byteLength: data.byteLength,
    }
  }

  function createBinaryPreview(data: ArrayBuffer): string {
    const maxPreview = config.binaryPreviewLength
    const view = new Uint8Array(
      data.byteLength > maxPreview ? data.slice(0, maxPreview) : data
    )
    return (
      Array.from(view)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ') + (data.byteLength > maxPreview ? ' ...' : '')
    )
  }

  function buildTextPreview(rawText: string): string | null {
    if (!config.captureTextPreview) {
      return null
    }

    const { truncated } = applyTextPayloadLimit(
      config.redactTextPayloads ? redactTextPayload(rawText) : rawText
    )

    // Use first 200 chars as preview
    return truncated.length > 200 ? truncated.slice(0, 200) + '...' : truncated
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

    const meta = getConnectionMeta(socket) ?? {
      correlationId,
      url,
      messageCountSent: 0,
      messageCountReceived: 0,
      createdAt: performance.now(),
      handshakeCompleted: false,
    }
    meta.handshakeCompleted = true
    connectionMeta.set(socket, meta)

    subscriber(
      new Box({
        type: NetworkMessageType.WebSocketOpen,
        correlationId,
        url,
      })
    )
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
    connectionMeta.delete(socket)
    socket.removeEventListener('close', handleClose)
    socket.removeEventListener('error', handleError)
  }

  async function processWebSocketPayload(
    rawData: ArrayBuffer,
    isBinary: boolean,
    rawText: string,
    direction: 'outbound' | 'inbound',
    correlationId: SyntheticId
  ) {
    if (isBinary) {
      const { truncated } = applyBinaryPayloadLimit(rawData)
      const preview = config.captureBinaryPreview
        ? createBinaryPreview(truncated)
        : null

      subscriber(
        new Box({
          type:
            direction === 'outbound'
              ? NetworkMessageType.WebSocketOutbound
              : NetworkMessageType.WebSocketInbound,
          correlationId,
          messageType: WebSocketMessageType.Binary,
          data: truncated,
          preview,
        })
      )
    } else {
      const processedText = config.redactTextPayloads
        ? redactTextPayload(rawText)
        : rawText
      const { truncated, isTruncated } = applyTextPayloadLimit(processedText)
      const payload = isTruncated ? truncated : processedText
      const encoded = textEncoder.encode(payload).buffer

      subscriber(
        new Box({
          type:
            direction === 'outbound'
              ? NetworkMessageType.WebSocketOutbound
              : NetworkMessageType.WebSocketInbound,
          correlationId,
          messageType: WebSocketMessageType.Text,
          data: encoded,
          preview: buildTextPreview(rawText),
        })
      )
    }
  }

  async function sendEffect(
    socket: WebSocket,
    data: string | ArrayBufferLike | Blob | ArrayBufferView
  ) {
    const correlationId = getOrCreateCorrelationId(socket)
    const meta = getConnectionMeta(socket)
    if (meta) {
      meta.messageCountSent++
    }

    const isBinary =
      data instanceof ArrayBuffer ||
      data instanceof Blob ||
      ArrayBuffer.isView(data)

    const rawData = isBinary
      ? await dataToArrayBuffer(data)
      : new ArrayBuffer(0)
    const rawText = typeof data === 'string' ? data : ''

    await processWebSocketPayload(
      rawData,
      isBinary,
      rawText,
      'outbound',
      correlationId
    )
  }

  const messageEventObserver = createMessageEventObserver(ev => {
    ;(async function () {
      const target = ev.currentTarget

      if (target && isWebSocket(target)) {
        if (!hasCorrelationId(target)) {
          const correlationId = randomString(4)
          correlationIds.set(target, correlationId)
          const url = target.url
          connectionMeta.set(target, {
            correlationId,
            url,
            messageCountSent: 0,
            messageCountReceived: 0,
            createdAt: performance.now(),
            handshakeCompleted: false,
          })

          subscriber(
            new Box({
              type: NetworkMessageType.WebSocketCreated,
              correlationId,
              url,
              protocols: null,
            })
          )

          openEffect(target)
        }

        const correlationId = getOrCreateCorrelationId(target)
        const meta = getConnectionMeta(target)
        if (meta) {
          meta.messageCountReceived++
        }

        const isBinary =
          ev.data instanceof ArrayBuffer ||
          ev.data instanceof Blob ||
          ArrayBuffer.isView(ev.data)

        const rawData = await dataToArrayBuffer(ev.data)
        const rawText =
          typeof ev.data === 'string'
            ? ev.data
            : new TextDecoder().decode(rawData)

        await processWebSocketPayload(
          rawData,
          isBinary,
          rawText,
          'inbound',
          correlationId
        )
      }
    })()
  })

  const _WebSocket = globalThis.WebSocket

  const WebSocketCtorProxy = new Proxy(_WebSocket, {
    construct(target, args, newTarget) {
      const ws = Reflect.construct(target, args, newTarget)

      const correlationId = randomString(4)
      correlationIds.set(ws, correlationId)

      const url = typeof args[0] === 'string' ? args[0] : ''
      const protocols =
        args[1] != null
          ? Array.isArray(args[1])
            ? args[1].join(', ')
            : String(args[1])
          : null

      connectionMeta.set(ws, {
        correlationId,
        url,
        messageCountSent: 0,
        messageCountReceived: 0,
        createdAt: performance.now(),
        handshakeCompleted: false,
      })

      subscriber(
        new Box({
          type: NetworkMessageType.WebSocketCreated,
          correlationId,
          url,
          protocols,
        })
      )

      openEffect(ws)

      return ws
    },
  })

  const close = _WebSocket.prototype.close
  const send = _WebSocket.prototype.send

  return {
    observe(doc, vtree) {
      globalThis.WebSocket = WebSocketCtorProxy

      globalThis.WebSocket.prototype.send = function (this, ...args) {
        if (!hasCorrelationId(this)) {
          const correlationId = randomString(4)
          correlationIds.set(this, correlationId)
          const url = this.url
          connectionMeta.set(this, {
            correlationId,
            url,
            messageCountSent: 0,
            messageCountReceived: 0,
            createdAt: performance.now(),
            handshakeCompleted: this.readyState === WebSocket.OPEN,
          })

          subscriber(
            new Box({
              type: NetworkMessageType.WebSocketCreated,
              correlationId,
              url,
              protocols: null,
            })
          )
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
      if (newDescriptor) {
        Object.defineProperty(MessageEvent.prototype, 'data', newDescriptor)
      }
    },

    disconnect() {
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
