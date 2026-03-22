import { NetworkEvent, SourceEvent } from '@repro/domain'
import { Box } from '@repro/tdl'
import { isNetworkEvent } from './matchers'

export function findIndexedNetworkEvents(
  events: Array<SourceEvent>
): Array<[NetworkEvent, number]> {
  const indexedNetworkEvents: Array<[NetworkEvent, number]> = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (!event) continue

    if (isNetworkEvent(event)) {
      ;(event as Box<NetworkEvent>).apply(event => {
        indexedNetworkEvents.push([event, i])
      })
    }
  }

  return indexedNetworkEvents
}
