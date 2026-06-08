import {
  NetworkMessageType,
  SourceEventView,
  WebSocketInbound,
  WebSocketOutbound,
} from '@repro/domain'
import { List } from '@repro/tdl'
import { WebSocketGroup } from '../types'
import { findIndexedNetworkEvents } from './findIndexedNetworkEvents'
import { groupNetworkEvents } from './groupNetworkEvents'

export function findWebSocketConnections(
  events: List<SourceEventView>
): Array<WebSocketGroup> {
  const allGroups = groupNetworkEvents(findIndexedNetworkEvents(events))
  return allGroups.filter(
    (group): group is WebSocketGroup => group.type === 'ws'
  )
}

export function findWebSocketFramesForConnection(
  events: List<SourceEventView>,
  correlationId: string
): Array<{
  time: number
  index: number
  data: WebSocketInbound | WebSocketOutbound
}> {
  const frames: Array<{
    time: number
    index: number
    data: WebSocketInbound | WebSocketOutbound
  }> = []

  for (const [event, index] of findIndexedNetworkEvents(events)) {
    event.data.apply(data => {
      if (
        data.correlationId === correlationId &&
        (data.type === NetworkMessageType.WebSocketInbound ||
          data.type === NetworkMessageType.WebSocketOutbound)
      ) {
        frames.push({
          time: event.time,
          index,
          data: data as WebSocketInbound | WebSocketOutbound,
        })
      }
    })
  }

  return frames.sort((a, b) => a.time - b.time)
}
