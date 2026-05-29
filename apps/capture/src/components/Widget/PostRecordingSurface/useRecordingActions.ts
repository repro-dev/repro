import { Analytics } from '@repro/analytics'
import { RecordingMode } from '@repro/domain'
import { observeFuture } from '@repro/future-utils'
import { useMessaging } from '@repro/messaging'
import { Playback } from '@repro/playback'
import { sliceEventsAtRange } from '@repro/recording'
import { UploadProgress } from '@repro/recording-api'
import { toByteString } from '@repro/wire-formats'
import { detect } from 'detect-browser'
import { useCallback, useEffect, useState } from 'react'
import { Subscription, switchMap, timer } from 'rxjs'

const browser = detect()

export interface UploadState {
  isUploading: boolean
  progress: UploadProgress | null
  error: Error | null
  uploadRef: string | null
}

export interface RecordingActions {
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

  const getSerializedEvents = useCallback(() => {
    let events = playback.getSourceEvents()

    if (recordingMode === RecordingMode.Replay) {
      const maxTime = playback.getDuration()
      const minTime = Math.max(0, maxTime - selectedDuration)
      events = sliceEventsAtRange(events, [minTime, maxTime])
    }

    const byteStrings = events
      .toSource()
      .map(view =>
        toByteString(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
        )
      )

    return { byteStrings }
  }, [playback, recordingMode, selectedDuration])

  const enqueueUpload = useCallback(
    (values: { title: string; description: string | null }) => {
      if (!projectId) {
        return
      }

      let events = playback.getSourceEvents()
      const maxTime = playback.getDuration()
      const minTime = Math.max(0, maxTime - selectedDuration)

      if (recordingMode === RecordingMode.Replay) {
        events = sliceEventsAtRange(events, [minTime, maxTime])
      }

      Analytics.track('capture:save-start', {
        recordingSize: events
          .toSource()
          .map(event => event.byteLength)
          .reduce((a, b) => a + b, 0)
          .toString(),
      })

      agent.raiseIntent({
        type: 'upload:enqueue',
        payload: {
          projectId,
          title: values.title,
          description: values.description,
          url: typeof location !== 'undefined' ? location.href : '',
          duration: selectedDuration,
          mode: recordingMode,
          events: events
            .toSource()
            .map(view =>
              toByteString(
                new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
              )
            ),
          browserName: browser && browser.name,
          browserVersion: browser && browser.version,
          operatingSystem: browser && browser.os,
        },
      })
    },
    [playback, recordingMode, selectedDuration, agent, projectId]
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
    getSerializedEvents,
    enqueueUpload,
    downloadLocally,
    uploadState,
    pollUploadProgress,
    setUploadState,
  }
}
