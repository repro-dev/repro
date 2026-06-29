import { Analytics } from '@repro/analytics'
import { RecordingMode } from '@repro/domain'
import { observeFuture } from '@repro/future-utils'
import { useMessaging } from '@repro/messaging'
import { Playback } from '@repro/playback'
import { sliceEventsAtRange } from '@repro/recording'
import { UploadProgress } from '@repro/recording-api'
import { toByteString } from '@repro/wire-formats'
import { detect } from 'detect-browser'
import { fork } from 'fluture'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Subscription, switchMap, timer } from 'rxjs'
import type { PrivacyOverrides } from './PrivacySection'

const browser = detect()

export interface UploadState {
  isUploading: boolean
  progress: UploadProgress | null
  error: Error | null
  uploadRef: string | null
  uploadProjectId: string | null
}

interface SelectedRecording {
  events: ReturnType<Playback['getSourceEvents']>
  duration: number
  startTimeMs: number
  resourceMap: ReturnType<Playback['getResourceMap']>
}

interface CaptureUploadContextValue {
  uploadState: UploadState
  enqueueUpload(
    projectId: string,
    title: string,
    description: string | null
  ): void
  setPrivacyOverrides(overrides: PrivacyOverrides): void
}

const CaptureUploadContext =
  React.createContext<CaptureUploadContextValue | null>(null)

export function useCaptureUpload(): CaptureUploadContextValue {
  const ctx = React.useContext(CaptureUploadContext)
  if (!ctx) {
    throw new Error(
      'useCaptureUpload must be used within a CaptureUploadProvider'
    )
  }
  return ctx
}

interface CaptureUploadProviderProps {
  children: React.ReactNode
  playback: Playback
  recordingMode: RecordingMode
  selectedDuration: number
  open: boolean
}

function serializeEvents(events: ReturnType<Playback['getSourceEvents']>) {
  return events
    .toSource()
    .map(view =>
      toByteString(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      )
    )
}

export const CaptureUploadProvider: React.FC<CaptureUploadProviderProps> = ({
  children,
  playback,
  recordingMode,
  selectedDuration,
  open,
}) => {
  const agent = useMessaging()
  const privacyOverridesRef = useRef<PrivacyOverrides | null>(null)

  const [uploadState, setUploadStateInner] = useState<UploadState>({
    isUploading: false,
    progress: null,
    error: null,
    uploadRef: null,
    uploadProjectId: null,
  })

  const setUploadState = useCallback(
    (partial: Partial<UploadState>) => {
      setUploadStateInner(prev => ({ ...prev, ...partial }))
    },
    [setUploadStateInner]
  )

  useEffect(() => {
    if (!open) {
      setUploadStateInner({
        isUploading: false,
        progress: null,
        error: null,
        uploadRef: null,
        uploadProjectId: null,
      })
    }
  }, [open])

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
        // back to full source events so upload still works.
      }
    }

    return {
      events: sourceEvents,
      duration: playbackDuration,
      startTimeMs: 0,
      resourceMap: playback.getResourceMap(),
    }
  }, [playback, recordingMode, selectedDuration])

  const enqueueUpload = useCallback(
    (projectId: string, title: string, description: string | null) => {
      console.log(
        '[capture] enqueueUpload called',
        { projectId, title, recordingMode },
        'agent:',
        agent
      )
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
        projectId,
        title,
        description,
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
        console.log('[capture] raiseIntent rejected', error)
        setUploadState({ error, isUploading: false })
      })((ref: unknown) => {
        console.log('[capture] raiseIntent resolved, ref=', ref)
        setUploadState({
          uploadRef: ref as string,
          uploadProjectId: projectId,
          isUploading: true,
        })
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
      setUploadState,
      getSelectedRecording,
      privacyOverridesRef,
    ]
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

          console.log('[upload:progress]', progress)

          if (progress.completed) {
            if (progress.error) {
              console.error('[upload:progress] upload failed', progress.error)
            } else {
              console.log('[upload:progress] upload complete')
            }
            setUploadState({ isUploading: false })
          }
        })
      )
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [setUploadState, uploadState.uploadRef, uploadState.isUploading, agent])

  const setPrivacyOverrides = useCallback((overrides: PrivacyOverrides) => {
    privacyOverridesRef.current = overrides
  }, [])

  const value = useMemo(
    () => ({ uploadState, enqueueUpload, setPrivacyOverrides }),
    [uploadState, enqueueUpload, setPrivacyOverrides]
  )

  return (
    <CaptureUploadContext.Provider value={value}>
      {children}
    </CaptureUploadContext.Provider>
  )
}
