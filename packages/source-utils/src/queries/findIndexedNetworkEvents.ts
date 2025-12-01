import { NetworkEvent, SourceEventView } from '@repro/domain'
import { Box, List } from '@repro/tdl'
import { isNetworkEvent } from './matchers'

export function findIndexedNetworkEvents(
  events: List<SourceEventView>
): Array<[NetworkEvent, number]> {
  const indexedNetworkEvents: Array<[NetworkEvent, number]> = []

  for (let i = 0, len = events.size(); i < len; i++) {
    const event = events.over(i)

    if (event && isNetworkEvent(event)) {
      ;(event as Box<NetworkEvent>).apply(event => {
        indexedNetworkEvents.push([event, i])
      })
    }
  }

  return indexedNetworkEvents
}
