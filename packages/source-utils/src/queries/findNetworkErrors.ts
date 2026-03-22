import { SourceEvent } from '@repro/domain'
import { FetchGroup, WebSocketGroup } from '../types'
import { findIndexedNetworkEvents } from './findIndexedNetworkEvents'
import { groupNetworkEvents } from './groupNetworkEvents'

function isFetchGroup(group: FetchGroup | WebSocketGroup): group is FetchGroup {
  return group.type === 'fetch'
}

export function findNetworkErrors(
  events: Array<SourceEvent>
): Array<FetchGroup> {
  const indexedNetworkEvents = findIndexedNetworkEvents(events)
  const groupedNetworkEvents = groupNetworkEvents(indexedNetworkEvents)

  const networkErrors: Array<FetchGroup> = []

  for (const group of groupedNetworkEvents) {
    if (isFetchGroup(group) && group.response && group.response.status >= 400) {
      networkErrors.push(group)
    }
  }

  return networkErrors
}
