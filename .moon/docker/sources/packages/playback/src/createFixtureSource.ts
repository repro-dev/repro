import { createAtom } from '@repro/atom'
import { SourceEventView } from '@repro/domain'
import { calculateDuration } from '@repro/source-utils'
import { unpackListInto } from '@repro/std'
import { List } from '@repro/tdl'
import { ReadyState, Source } from './types'

export function createFixtureSource(fileName: string): Source {
  const request: Promise<ArrayBuffer> = fetch(fileName).then(res =>
    res.arrayBuffer()
  )

  const [$events, setEvents] = createAtom(new List(SourceEventView, []))
  const [$duration, setDuration] = createAtom(0)
  const [$readyState, setReadyState] = createAtom<ReadyState>('waiting')
  const [$error, setError] = createAtom<Error | null>(null)
  const [$resourceMap] = createAtom<Record<string, string>>({})

  request
    .then(buffer => {
      const list = new List(SourceEventView, [])

      unpackListInto(buffer, list)

      setDuration(calculateDuration(list))
      setEvents(list)

      setReadyState('ready')
    })
    .catch(error => {
      setError(error)
      setReadyState('failed')
    })

  return {
    $events,
    $duration,
    $readyState,
    $error,
    $resourceMap,
  }
}
