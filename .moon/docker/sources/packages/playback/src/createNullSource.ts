import { createAtom } from '@repro/atom'
import { SourceEventView } from '@repro/domain'
import { List } from '@repro/tdl'
import { ReadyState } from '.'
import { Source } from './types'

export function createNullSource(): Source {
  const [$events] = createAtom(new List(SourceEventView, []))
  const [$duration] = createAtom(0)
  const [$readyState] = createAtom<ReadyState>('waiting')
  const [$error] = createAtom<Error | null>(null)
  const [$resourceMap] = createAtom<Record<string, string>>({})

  return {
    $events,
    $duration,
    $readyState,
    $error,
    $resourceMap,
  }
}
