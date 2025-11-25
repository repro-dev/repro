import { SourceEventView } from '@repro/domain'

import { List } from '@repro/tdl'

export function calculateDuration(events: List<SourceEventView>) {
  const first = events.over(0)
  const last = events.over(events.size() - 1)

  return first && last
    ? last.get('time').orElse(0) - first.get('time').orElse(0)
    : 0
}
