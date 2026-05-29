import { Analytics } from '@repro/analytics'
import { RecordingMode, SourceEventType, SourceEventView } from '@repro/domain'
import { observeFuture } from '@repro/future-utils'
import { useMessaging } from '@repro/messaging'
import { Playback } from '@repro/playback'
import { sliceEventsAtRange } from '@repro/recording'
import { UploadProgress } from '@repro/recording-api'
import { toByteString } from '@repro/wire-formats'
import { detect } from 'detect-browser'
import { fork } from 'fluture'
import { useCallback, useEffect, useState } from 'react'
import { Subscription, switchMap, timer } from 'rxjs'

const browser = detect()

function serializeEvents(events: ReturnType<Playback['getSourceEvents']>) {
  return events
    .toSource()
    .map(view =>
      toByteString(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      )
    )
}

function getReplaySliceSourceOffset(
  sourceEvents: ReturnType<Playback['getSourceEvents']>,
  minTime: number
) {
  let offset: number | null = null

  for (let i = 0, len = sourceEvents.size(); i < len; i++) {
    const event = sourceEvents.at(i)

    if (event) {
      SourceEventView.over(event).apply(lens => {
        const time = lens.time

        if (time <= minTime) {
          if (lens.type === SourceEventType.Snapshot || offset !== null) {
            offset = time
          }
        }
      })
    }
  }

  return offset ?? minTime
}

export interface UploadState {
  isUploading: boolean
  progress: UploadProgress | null
  error: Error | null
  uploadRef: string | null
}

export interface SelectedRecording {
  events: ReturnType<Playback['getSourceEvents']>
  duration: number
  startTimeMs: number
  resourceMap: ReturnType<Playback['getResourceMap']>
}

export interface RecordingActions {
  getSelectedRecording(): SelectedRecording
  getSerializedEvents(): { byteStrings: string[] }
  enqueueUpload(values: { title: string; description: string | null }): void
  downloadLocally(): void
  uploadState: UploadState
  pollUploadProgress(ref: string): void
  setUploadState(state: Partial<UploadState>): void
}

export function useRecordingActions(
  playback: Playback,
  projectId: string | null,
  recordingMode: RecordingMode,
  selectedDuration: number
): RecordingActions {
  const agent = useMessaging()
  const [uploadState, setUploadStateInner] = useState<UploadState>({
    isUploading: false,
    progress: null,
    error: null,
    uploadRef: null,
  })

  const setUploadState = useCallback(
    (partial: Partial<UploadState>) => {
      setUploadStateInner(prev => ({ ...prev, ...partial }))
    },
    [setUploadStateInner]
  )

  const getSelectedRecording = useCallback((): SelectedRecording => {
    const sourceEvents = playback.getSourceEvents()
    const playbackDuration = playback.getDuration()

    if (recordingMode === RecordingMode.Replay) {
      const maxTime = playbackDuration
      const minTime = Math.max(0, maxTime - selectedDuration)
      const startTimeMs = getReplaySliceSourceOffset(sourceEvents, minTime)
      return {
        events: sliceEventsAtRange(sourceEvents, [minTime, maxTime]),
        duration: maxTime - startTimeMs,
        startTimeMs,
        resourceMap: playback.getResourceMap(),
      }
    }

    return {
      events: sourceEvents,
      duration: playbackDuration,
      startTimeMs: 0,
      resourceMap: playback.getResourceMap(),
    }
  }, [playback, recordingMode, selectedDuration])

  const getSerializedEvents = useCallback(() => {
    const { events } = getSelectedRecording()
    const byteStrings = serializeEvents(events)

    return { byteStrings }
  }, [getSelectedRecording])

  const enqueueUpload = useCallback(
    (values: { title: string; description: string | null }) => {
      if (!projectId) {
        return
      }

      const selected = getSelectedRecording()
      const byteStrings = serializeEvents(selected.events)

      Analytics.track('capture:save-start', {
        recordingSize: selected.events
          .toSource()
          .map(event => event.byteLength)
          .reduce((a, b) => a + b, 0)
          .toString(),
      })

      fork((error: Error) => {
        setUploadState({ error, isUploading: false })
      })((ref: unknown) => {
        setUploadState({ uploadRef: ref as string, isUploading: true })
      })(
        agent.raiseIntent({
          type: 'upload:enqueue',
          payload: {
            projectId,
            title: values.title,
            description: values.description,
            url: typeof location !== 'undefined' ? location.href : '',
            duration: selected.duration,
            mode: recordingMode,
            events: byteStrings,
            browserName: browser && browser.name,
            browserVersion: browser && browser.version,
            operatingSystem: browser && browser.os,
          },
        })
      )
    },
    [recordingMode, agent, projectId, setUploadState, getSelectedRecording]
  )

  const downloadLocally = useCallback(() => {
    const { byteStrings } = getSerializedEvents()

    const blob = new Blob(
      [JSON.stringify({ events: byteStrings, format: 'json-placeholder' })],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'recording.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [getSerializedEvents])

  const pollUploadProgress = useCallback(
    (ref: string) => {
      setUploadState({ isUploading: true, uploadRef: ref })
    },
    [setUploadState]
  )

  // Progress polling effect
  useEffect(() => {
    const subscription = new Subscription()

    if (uploadState.uploadRef && uploadState.isUploading) {
      const progress$ = timer(0, 250).pipe(
        switchMap(() =>
          observeFuture(
            agent.raiseIntent({
              type: 'upload:progress',
              payload: {
                ref: uploadState.uploadRef,
              },
            })
          )
        )
      )

      subscription.add(
        progress$.subscribe(rawProgress => {
          const progress = rawProgress as UploadProgress
          setUploadState({ progress })

          if (progress.completed) {
            setUploadState({ isUploading: false })
          }
        })
      )
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [setUploadState, uploadState.uploadRef, uploadState.isUploading, agent])

  return {
    getSelectedRecording,
    getSerializedEvents,
    enqueueUpload,
    downloadLocally,
    uploadState,
    pollUploadProgress,
    setUploadState,
  }
}
