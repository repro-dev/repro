import { ApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { SourceEventView } from '@repro/domain'
import { logger } from '@repro/logger'
import { ReadyState, Source } from '@repro/playback'
import { WritableStream } from '@repro/stream-utils'
import { List } from '@repro/tdl'
import { fork } from 'fluture'
import {
  getShareRecordingEventsStream,
  getShareRecordingInfo,
  getShareResourceMap,
} from './queries'

export function createShareSource(
  token: string,
  apiClient: ApiClient,
  extra: { encryptionKey?: string } = {}
): Source {
  const [$events, setEvents] = createAtom(new List(SourceEventView, []))
  const [$duration, setDuration] = createAtom(0)
  const [$readyState, setReadyState] = createAtom<ReadyState>('waiting')
  const [$error, setError] = createAtom<Error | null>(null)
  const [$resourceMap, setResourceMap] = createAtom<Record<string, string>>({})

  getShareRecordingInfo(apiClient, token).pipe(
    fork(error => {
      logger.error(error)
      setReadyState('failed')
    })(info => {
      setDuration(info.recording.duration)
    })
  )

  getShareResourceMap(apiClient, token).pipe(
    fork(error => {
      logger.error(error)
      setReadyState('failed')
    })(resourceMap => {
      setResourceMap(resourceMap)
    })
  )

  getShareRecordingEventsStream(apiClient, token, extra.encryptionKey).pipe(
    fork(error => {
      logger.error(error)
      setReadyState('failed')
    })(events => {
      const sourceList = new List(SourceEventView, [])
      setEvents(sourceList)

      events
        .pipeTo(
          new WritableStream({
            write(buffer) {
              sourceList.append(SourceEventView.over(new DataView(buffer)))
              setReadyState('ready')
            },

            close() {
              setReadyState('ready')
            },
          })
        )
        .then(() => {
          setReadyState('ready')
        })
        .catch(error => {
          setError(error)
          setReadyState('failed')
        })
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
