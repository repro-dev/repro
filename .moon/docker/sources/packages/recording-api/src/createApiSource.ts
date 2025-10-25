import { ApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { SourceEventView } from '@repro/domain'
import { logger } from '@repro/logger'
import { ReadyState, Source } from '@repro/playback'
import { WritableStream } from '@repro/stream-utils'
import { List } from '@repro/tdl'
import { both, fork } from 'fluture'
import {
  getRecordingEventsStream,
  getRecordingInfo,
  getResourceMap,
} from './queries'

export function createApiSource(
  recordingId: string,
  apiClient: ApiClient,
  extra: { encryptionKey?: string } = {}
): Source {
  const [$events, setEvents] = createAtom(new List(SourceEventView, []))
  const [$duration, setDuration] = createAtom(0)
  const [$readyState, setReadyState] = createAtom<ReadyState>('waiting')
  const [$error, setError] = createAtom<Error | null>(null)
  const [$resourceMap, setResourceMap] = createAtom<Record<string, string>>({})

  both(getRecordingInfo(apiClient, recordingId))(
    both(getRecordingEventsStream(apiClient, recordingId, extra.encryptionKey))(
      getResourceMap(apiClient, recordingId)
    )
  ).pipe(
    fork(error => {
      logger.error(error)
      setReadyState('failed')
    })(([info, [events, resourceMap]]) => {
      const sourceList = new List(SourceEventView, [])
      setEvents(sourceList)

      events
        .pipeTo(
          new WritableStream({
            write(buffer) {
              sourceList.append(SourceEventView.over(new DataView(buffer)))
              setReadyState('ready')
            },
          })
        )
        .catch(error => {
          setError(error)
          setReadyState('failed')
        })

      setDuration(info.duration)
      setResourceMap(resourceMap)
    })
  )

  return {
    $events,
    $duration,
    $readyState,
    $error,
    $resourceMap,
  }
}
