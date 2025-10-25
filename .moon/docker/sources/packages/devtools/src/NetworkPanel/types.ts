import {
  FetchRequest,
  FetchResponse,
  WebSocketClose,
  WebSocketInbound,
  WebSocketOpen,
  WebSocketOutbound,
} from '@repro/domain'

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

  messages?: Array<{
    time: number
    index: number
    data: WebSocketInbound | WebSocketOutbound
  }>
}
