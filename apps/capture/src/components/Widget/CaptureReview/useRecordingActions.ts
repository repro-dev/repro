import { Analytics } from '@repro/analytics'
import { RecordingMode } from '@repro/domain'
import { observeFuture } from '@repro/future-utils'
import { useMessaging } from '@repro/messaging'
import { Playback } from '@repro/playback'
import { sliceEventsAtRange } from '@repro/recording'
import { UploadProgress } from '@repro/recording-api'
import { toBinaryWireFormat, toByteString } from '@repro/wire-formats'
import { detect } from 'detect-browser'
import { fork } from 'fluture'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Subscription, switchMap, timer } from 'rxjs'
import type { PrivacyOverrides } from './PrivacySection'

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
  enqueueUpload(
    values: { title: string; description: string | null },
    projectIdOverride?: string
  ): void
  downloadLocally(): void
  isEmpty: boolean
  uploadState: UploadState
  pollUploadProgress(ref: string): void
  setUploadState(state: Partial<UploadState>): void
  setPrivacyOverrides(overrides: PrivacyOverrides): void
}

export function useRecordingActions(
  playback: Playback,
  projectId: string | null,
  recordingMode: RecordingMode,
  selectedDuration: number
): RecordingActions {
  const agent = useMessaging()
  const privacyOverridesRef = useRef<PrivacyOverrides | null>(null)

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

  const setPrivacyOverrides = useCallback((overrides: PrivacyOverrides) => {
    privacyOverridesRef.current = overrides
  }, [])

  const getSelectedRecording = useCallback((): SelectedRecording => {
    const sourceEvents = playback.getSourceEvents()
    const playbackDuration = playback.getDuration()

    if (recordingMode === RecordingMode.Replay) {
      const maxTime = playbackDuration
      const minTime = Math.max(0, maxTime - selectedDuration)

      try {
        const { events, sourceOffset: startTimeMs } = sliceEventsAtRange(
          sourceEvents,
          [minTime, maxTime]
        )

        return {
          events,
          duration: maxTime - startTimeMs,
          startTimeMs,
          resourceMap: playback.getResourceMap(),
        }
      } catch {
        // sliceEventsAtRange throws when no leading snapshot exists — fall
        // back to full source events so Agentic/upload/download still work.
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
    (
      values: { title: string; description: string | null },
      projectIdOverride?: string
    ) => {
      const resolvedProjectId = projectIdOverride ?? projectId
      if (!resolvedProjectId) {
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

      const payload: Record<string, unknown> = {
        projectId: resolvedProjectId,
        title: values.title,
        description: values.description,
        url: typeof location !== 'undefined' ? location.href : '',
        duration: selected.duration,
        mode: recordingMode,
        events: byteStrings,
        browserName: browser && browser.name,
        browserVersion: browser && browser.version,
        operatingSystem: browser && browser.os,
      }

      const currentOverrides = privacyOverridesRef.current
      if (
        currentOverrides &&
        (currentOverrides.maskedSelectors.length > 0 ||
          currentOverrides.ignoredSelectors.length > 0)
      ) {
        payload.privacyOverrides = {
          maskedSelectors: currentOverrides.maskedSelectors,
          ignoredSelectors: currentOverrides.ignoredSelectors,
        }
      }

      fork((error: Error) => {
        setUploadState({ error, isUploading: false })
      })((ref: unknown) => {
        setUploadState({ uploadRef: ref as string, isUploading: true })
      })(
        agent.raiseIntent({
          type: 'upload:enqueue',
          payload,
        })
      )
    },
    [
      recordingMode,
      agent,
      projectId,
      setUploadState,
      getSelectedRecording,
      privacyOverridesRef,
    ]
  )

  const downloadLocally = useCallback(() => {
    const selected = getSelectedRecording()

    // Guard: bail if there are no events to download
    if (selected.events.size() === 0) {
      console.warn('downloadLocally: no events to download')
      return
    }

    const views = selected.events.toSource()

    let wireFormatBuffer: DataView
    try {
      wireFormatBuffer = toBinaryWireFormat(views)
    } catch (err) {
      console.warn('downloadLocally: failed to encode wire format', err)
      return
    }

    const blob = new Blob([wireFormatBuffer], {
      type: 'application/octet-stream',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `repro-recording-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.repro`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [getSelectedRecording])

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

  const isEmpty = playback.getSourceEvents().size() === 0

  return {
    getSelectedRecording,
    getSerializedEvents,
    enqueueUpload,
    downloadLocally,
    uploadState,
    pollUploadProgress,
    setUploadState,
    setPrivacyOverrides,
    isEmpty,
  }
}
