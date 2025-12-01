import { NetworkEvent, NetworkMessageType } from '@repro/domain'
import { FetchGroup, WebSocketGroup } from '~/types'

export function groupNetworkEvents(
  /** events: Array<[NetworkEvent, index]> */
  events: Array<[NetworkEvent, number]>
): Array<FetchGroup | WebSocketGroup> {
  const groups: Record<string, FetchGroup | WebSocketGroup> = {}
  const orderedGroupIds: Array<string> = []

  for (const [event, index] of events) {
    event.data.apply(data => {
      let group = groups[data.correlationId]

      if (!group) {
        switch (data.type) {
          case NetworkMessageType.FetchRequest:
            group = {
              type: 'fetch',
              requestTime: event.time,
              requestIndex: index,
              request: data,
            }

            orderedGroupIds.push(data.correlationId)
            break

          case NetworkMessageType.WebSocketOpen:
            group = {
              type: 'ws',
              openTime: event.time,
              openIndex: index,
              open: data,
            }

            orderedGroupIds.push(data.correlationId)
            break
        }
      }

      if (!group) {
        return
      }

      switch (data.type) {
        case NetworkMessageType.FetchResponse:
          ;(group as FetchGroup).response = data
          ;(group as FetchGroup).responseTime = event.time
          ;(group as FetchGroup).responseIndex = index
          break

        case NetworkMessageType.WebSocketClose:
          ;(group as WebSocketGroup).close = data
          ;(group as WebSocketGroup).closeTime = event.time
          ;(group as WebSocketGroup).closeIndex = index
          break

        case NetworkMessageType.WebSocketInbound:
        case NetworkMessageType.WebSocketOutbound:
          const messages = (group as WebSocketGroup).messages || []
          messages.push({
            index,
            time: event.time,
            data,
          })
          ;(group as WebSocketGroup).messages = messages
          break
      }

      groups[data.correlationId] = group
    })
  }

  const orderedGroups: Array<FetchGroup | WebSocketGroup> = []

  for (const groupId of orderedGroupIds) {
    const group = groups[groupId]

    if (group) {
      orderedGroups.push(group)
    }
  }

  return orderedGroups
}
