import { NetworkEvent, SourceEvent } from '@repro/domain'
import { Box } from '@repro/tdl'

/**
 * Unwrap boxed network source events into `[NetworkEvent, number]` tuples
 * for consumption by `groupNetworkEvents`. The index field is set to 0
 * (dummy) since the agentic tool handlers don't use replay indices.
 */
export function unwrapNetworkEvents(
  events: SourceEvent[]
): Array<[NetworkEvent, number]> {
  const indexed: Array<[NetworkEvent, number]> = []
  for (const e of events) {
    ;(e as Box<NetworkEvent>).apply(n => indexed.push([n, 0]))
  }
  return indexed
}
