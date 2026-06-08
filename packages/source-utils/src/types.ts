import {
  FetchRequest,
  FetchResponse,
  WebSocketClose,
  WebSocketError,
  WebSocketInbound,
  WebSocketOpen,
  WebSocketOutbound,
} from '@repro/domain'

export interface Sample<T> {
  from: T
  to: T
  duration: number
}

export interface FetchGroup {
  type: 'fetch'

  requestTime: number
  requestIndex: number
  request: FetchRequest

  responseTime?: number
  responseIndex?: number
  response?: FetchResponse
}

export interface WebSocketGroup {
  type: 'ws'

  openTime: number
  openIndex: number
  open: WebSocketOpen

  closeTime?: number
  closeIndex?: number
  close?: WebSocketClose

  errorTime?: number
  errorIndex?: number
  error?: WebSocketError

  messageCountSent: number
  messageCountReceived: number

  messages?: Array<{
    time: number
    index: number
    data: WebSocketInbound | WebSocketOutbound
  }>
}
