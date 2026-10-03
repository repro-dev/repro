import { Analytics } from '@repro/analytics'
import { useSession } from '@repro/auth'
import { RecordingMode } from '@repro/domain'
import { observeFuture } from '@repro/future-utils'
import { useMessaging } from '@repro/messaging'
import { Playback } from '@repro/playback'
import { sliceEventsAtRange } from '@repro/recording'
import { UploadProgress } from '@repro/recording-api'
import { toByteString } from '@repro/wire-formats'
import { detect } from 'detect-browser'
import { fork, type Cancel } from 'fluture'
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  asyncScheduler,
  catchError,
  concatMap,
  defer,
  EMPTY,
  expand,
  filter,
  map,
  of,
  Subscription,
  take,
  throwError,
  timer,
  type Observable,
  type SchedulerLike,
} from 'rxjs'
import type { PrivacyOverrides } from './PrivacySection'

const browser = detect()

export interface UploadState {
  isUploading: boolean
  progress: UploadProgress | null
  error: Error | null
  statusUnknown: boolean
  uploadSource: UploadSource | null
  uploadTitle: string
  uploadRef: string | null
  uploadProjectId: string | null
}

export type UploadSource = 'report' | 'save-recording'

export interface UploadReservation {
  id: number
  source: UploadSource
  principalId: string
}

export interface ReportDraft {
  title: string
  description: string
}

interface SelectedRecording {
  events: ReturnType<Playback['getSourceEvents']>
  duration: number
  startTimeMs: number
  resourceMap: ReturnType<Playback['getResourceMap']>
}

interface CaptureUploadContextValue {
  uploadState: UploadState
  uploadPrincipalId: string | null
  uploadReservation: UploadReservation | null
  reserveUpload(source: UploadSource): number | null
  releaseUploadReservation(id: number): void
  enqueueUpload(
    projectId: string,
    title: string,
    description: string | null,
    source?: UploadSource,
    reservationId?: number
  ): boolean
  reportDraft: ReportDraft
  reportDraftPrincipalId: string | null
  setReportDraft(draft: ReportDraft): void
  setUploadTitle(title: string): void
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
  /** This provider outlives modal visibility changes and owns active uploads. */
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

const PROGRESS_POLL_INTERVAL_MS = 250
const MAX_PROGRESS_POLL_INTERVAL_MS = 4_000
const MAX_CONSECUTIVE_NULL_PROGRESS_RESPONSES = 5

class UploadStatusUnknownError extends Error {
  constructor() {
    super('Upload status unknown after repeated null progress responses')
    this.name = 'UploadStatusUnknownError'
  }
}

export function pollProgressWithBackoff<T extends { completed: boolean }>(
  poll: () => Observable<T | null>,
  scheduler: SchedulerLike = asyncScheduler
): Observable<T> {
  let consecutiveFailures = 0
  let consecutiveNullResponses = 0
  type PollResult =
    | { type: 'progress'; progress: T }
    | { type: 'null' }
    | { type: 'rejected'; error: unknown }

  const singlePoll = (): Observable<PollResult> =>
    defer(poll).pipe(
      // observeFuture emits the value but does not complete the Future stream.
      take(1),
      map(progress =>
        progress === null
          ? ({ type: 'null' } as const)
          : ({ type: 'progress', progress } as const)
      ),
      catchError(error => of({ type: 'rejected', error } as const))
    )

  return singlePoll().pipe(
    expand(result => {
      if (result.type === 'progress') {
        if (result.progress.completed) return EMPTY
        consecutiveFailures = 0
        consecutiveNullResponses = 0
        return timer(PROGRESS_POLL_INTERVAL_MS, scheduler).pipe(
          concatMap(singlePoll)
        )
      }

      consecutiveFailures++
      if (result.type === 'null') {
        consecutiveNullResponses++
        if (
          consecutiveNullResponses >= MAX_CONSECUTIVE_NULL_PROGRESS_RESPONSES
        ) {
          return throwError(() => new UploadStatusUnknownError())
        }
      }
      const retryDelay = Math.min(
        PROGRESS_POLL_INTERVAL_MS * 2 ** (consecutiveFailures - 1),
        MAX_PROGRESS_POLL_INTERVAL_MS
      )
      if (result.type === 'rejected') {
        console.warn(
          '[upload:progress] status poll failed; retrying',
          result.error
        )
      } else {
        console.warn('[upload:progress] status returned no ref; retrying')
      }
      return timer(retryDelay, scheduler).pipe(concatMap(singlePoll))
    }, 1),
    filter(
      (result): result is { type: 'progress'; progress: T } =>
        result.type === 'progress'
    ),
    map(result => result.progress)
  )
}

export const CaptureUploadProvider: React.FC<CaptureUploadProviderProps> = ({
  children,
  playback,
  recordingMode,
  selectedDuration,
  open,
}) => {
  const session = useSession()
  const principalId = session?.id ?? null
  const principalIdRef = useRef(principalId)
  principalIdRef.current = principalId
  const agent = useMessaging()
  const agentRef = useRef(agent)
  agentRef.current = agent
  const privacyOverridesRef = useRef<PrivacyOverrides | null>(null)
  const uploadInFlightRef = useRef(false)
  const terminalResultPresentedWhileOpenRef = useRef(false)
  const enqueuePendingRef = useRef(false)
  const pendingEnqueueCancelRef = useRef<Cancel | null>(null)
  const uploadGenerationRef = useRef(0)
  const [uploadReservation, setUploadReservationInner] =
    useState<UploadReservation | null>(null)
  const uploadReservationRef = useRef<UploadReservation | null>(null)
  const uploadReservationSequenceRef = useRef(0)
  const setUploadReservation = useCallback(
    (reservation: UploadReservation | null) => {
      uploadReservationRef.current = reservation
      setUploadReservationInner(reservation)
    },
    []
  )
  const cleanupPendingEnqueue = useCallback(() => {
    uploadGenerationRef.current++
    if (enqueuePendingRef.current) pendingEnqueueCancelRef.current?.()
    pendingEnqueueCancelRef.current = null
    enqueuePendingRef.current = false
  }, [])

  const [uploadState, setUploadStateInner] = useState<UploadState>({
    isUploading: false,
    progress: null,
    error: null,
    statusUnknown: false,
    uploadSource: null,
    uploadTitle: '',
    uploadRef: null,
    uploadProjectId: null,
  })
  const uploadStateRef = useRef(uploadState)
  uploadStateRef.current = uploadState
  const [uploadPrincipalId, setUploadPrincipalIdInner] = useState<
    string | null
  >(null)
  const uploadPrincipalIdRef = useRef<string | null>(null)
  const setUploadPrincipalId = useCallback((id: string | null) => {
    uploadPrincipalIdRef.current = id
    setUploadPrincipalIdInner(id)
  }, [])
  const [reportDraftRecord, setReportDraftRecord] = useState<{
    principalId: string | null
    draft: ReportDraft
  }>({
    principalId: null,
    draft: { title: '', description: '' },
  })
  const reportDraftRecordRef = useRef(reportDraftRecord)
  reportDraftRecordRef.current = reportDraftRecord
  const reportDraft = reportDraftRecord.draft
  const reportDraftPrincipalId = reportDraftRecord.principalId

  const setUploadState = useCallback(
    (partial: Partial<UploadState>) => {
      uploadStateRef.current = { ...uploadStateRef.current, ...partial }
      setUploadStateInner(prev => ({ ...prev, ...partial }))
    },
    [setUploadStateInner]
  )

  const reserveUpload = useCallback(
    (source: UploadSource) => {
      const currentPrincipalId = principalIdRef.current
      const currentUploadState = uploadStateRef.current
      if (
        currentPrincipalId === null ||
        uploadReservationRef.current !== null ||
        uploadInFlightRef.current ||
        currentUploadState.isUploading
      ) {
        return null
      }
      if (
        currentUploadState.error !== null &&
        currentPrincipalId === uploadPrincipalIdRef.current &&
        source !== currentUploadState.uploadSource
      ) {
        return null
      }
      if (
        currentUploadState.statusUnknown &&
        (source !== currentUploadState.uploadSource ||
          currentPrincipalId !== uploadPrincipalIdRef.current)
      ) {
        return null
      }
      if (
        uploadPrincipalIdRef.current !== null &&
        currentPrincipalId !== uploadPrincipalIdRef.current &&
        (currentUploadState.isUploading ||
          currentUploadState.statusUnknown ||
          currentUploadState.error !== null ||
          currentUploadState.progress?.completed === true)
      ) {
        return null
      }

      const reservation = {
        id: ++uploadReservationSequenceRef.current,
        source,
        principalId: currentPrincipalId,
      }
      setUploadReservation(reservation)
      return reservation.id
    },
    [setUploadReservation]
  )

  const releaseUploadReservation = useCallback(
    (id: number) => {
      if (uploadReservationRef.current?.id !== id) return
      setUploadReservation(null)
    },
    [setUploadReservation]
  )

  const updateReportDraft = useCallback(
    (record: { principalId: string | null; draft: ReportDraft }) => {
      reportDraftRecordRef.current = record
      setReportDraftRecord(record)
    },
    []
  )
  const setReportDraft = useCallback(
    (draft: ReportDraft) => {
      updateReportDraft({ principalId, draft })
    },
    [principalId, updateReportDraft]
  )
  const clearReportDraft = useCallback(
    (ownerId?: string | null) => {
      const current = reportDraftRecordRef.current
      if (ownerId !== undefined && current.principalId !== ownerId) return
      updateReportDraft({
        principalId: current.principalId,
        draft: { title: '', description: '' },
      })
    },
    [updateReportDraft]
  )
  const setUploadTitle = useCallback(
    (title: string) => setUploadState({ uploadTitle: title }),
    [setUploadState]
  )

  useLayoutEffect(() => {
    if (principalId === null) return
    const current = reportDraftRecordRef.current
    if (current.principalId !== null) return
    updateReportDraft({ ...current, principalId })
  }, [principalId, updateReportDraft])

  useLayoutEffect(() => {
    const reservation = uploadReservationRef.current
    if (reservation && reservation.principalId !== principalId) {
      setUploadReservation(null)
    }
  }, [principalId, setUploadReservation])

  useLayoutEffect(() => {
    if (
      open &&
      uploadPrincipalId === principalId &&
      !uploadState.isUploading &&
      !uploadState.statusUnknown &&
      (uploadState.error !== null || uploadState.progress?.completed === true)
    ) {
      terminalResultPresentedWhileOpenRef.current = true
    }
  }, [
    open,
    principalId,
    uploadPrincipalId,
    uploadState.error,
    uploadState.isUploading,
    uploadState.progress,
    uploadState.statusUnknown,
  ])

  useEffect(() => {
    const hasTerminalResult =
      uploadState.error !== null || uploadState.progress?.completed === true
    if (
      open ||
      uploadInFlightRef.current ||
      uploadState.statusUnknown ||
      (hasTerminalResult &&
        (uploadPrincipalId !== principalId ||
          !terminalResultPresentedWhileOpenRef.current))
    ) {
      return
    }
    terminalResultPresentedWhileOpenRef.current = false
    const resetState: UploadState = {
      isUploading: false,
      progress: null,
      error: null,
      statusUnknown: false,
      uploadSource: null,
      uploadTitle: '',
      uploadRef: null,
      uploadProjectId: null,
    }
    uploadStateRef.current = resetState
    setUploadStateInner(resetState)
    setUploadPrincipalId(null)
    clearReportDraft()
  }, [
    clearReportDraft,
    open,
    principalId,
    setUploadPrincipalId,
    uploadPrincipalId,
    uploadState.error,
    uploadState.isUploading,
    uploadState.progress,
    uploadState.statusUnknown,
  ])

  useEffect(() => {
    return () => {
      cleanupPendingEnqueue()
      uploadReservationRef.current = null
    }
  }, [cleanupPendingEnqueue])

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
    (
      projectId: string,
      title: string,
      description: string | null,
      source: UploadSource = 'report',
      reservationId?: number
    ) => {
      const currentPrincipalId = principalIdRef.current
      const currentUploadState = uploadStateRef.current
      if (
        currentUploadState.statusUnknown &&
        (source !== currentUploadState.uploadSource ||
          currentPrincipalId !== uploadPrincipalIdRef.current)
      ) {
        return false
      }
      if (
        uploadPrincipalIdRef.current !== null &&
        currentPrincipalId !== uploadPrincipalIdRef.current &&
        (currentUploadState.isUploading ||
          currentUploadState.statusUnknown ||
          currentUploadState.error !== null ||
          currentUploadState.progress?.completed === true)
      ) {
        return false
      }
      if (currentPrincipalId === null) return false
      if (
        currentUploadState.error !== null &&
        currentPrincipalId === uploadPrincipalIdRef.current &&
        source !== currentUploadState.uploadSource
      ) {
        return false
      }

      const reservation = uploadReservationRef.current
      if (reservationId === undefined) {
        if (reservation !== null) return false
      } else if (
        !reservation ||
        reservation.id !== reservationId ||
        reservation.source !== source ||
        reservation.principalId !== currentPrincipalId
      ) {
        return false
      }
      if (uploadInFlightRef.current || currentUploadState.isUploading) {
        return false
      }

      if (reservationId !== undefined) setUploadReservation(null)
      terminalResultPresentedWhileOpenRef.current = false
      uploadInFlightRef.current = true
      enqueuePendingRef.current = true
      const generation = ++uploadGenerationRef.current
      setUploadPrincipalId(currentPrincipalId)
      setUploadState({
        isUploading: true,
        progress: null,
        error: null,
        statusUnknown: false,
        uploadSource: source,
        uploadTitle: title,
        uploadRef: null,
        uploadProjectId: projectId,
      })

      console.log('[capture] enqueueUpload called', { recordingMode })
      try {
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

        const cancel = fork((error: Error) => {
          if (generation !== uploadGenerationRef.current) return
          console.log('[capture] raiseIntent rejected', error)
          enqueuePendingRef.current = false
          pendingEnqueueCancelRef.current = null
          uploadInFlightRef.current = false
          setUploadState({
            error,
            isUploading: false,
            statusUnknown: currentUploadState.statusUnknown,
            uploadRef: null,
          })
        })((ref: unknown) => {
          if (generation !== uploadGenerationRef.current) return
          console.log('[capture] raiseIntent resolved, ref=', ref)
          enqueuePendingRef.current = false
          pendingEnqueueCancelRef.current = null
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

        if (enqueuePendingRef.current) pendingEnqueueCancelRef.current = cancel
      } catch (error) {
        if (generation !== uploadGenerationRef.current) return false
        enqueuePendingRef.current = false
        pendingEnqueueCancelRef.current = null
        uploadInFlightRef.current = false
        setUploadState({
          error: error instanceof Error ? error : new Error(String(error)),
          isUploading: false,
          statusUnknown: currentUploadState.statusUnknown,
          uploadRef: null,
        })
      }
      return true
    },
    [
      recordingMode,
      agent,
      setUploadPrincipalId,
      setUploadState,
      setUploadReservation,
      getSelectedRecording,
      privacyOverridesRef,
    ]
  )

  // Progress polling effect
  useEffect(() => {
    const subscription = new Subscription()
    const generation = uploadGenerationRef.current

    if (uploadState.uploadRef && uploadState.isUploading) {
      const progress$ = pollProgressWithBackoff(() =>
        observeFuture(
          agentRef.current.raiseIntent({
            type: 'upload:progress',
            payload: {
              ref: uploadState.uploadRef,
            },
          })
        ).pipe(map(rawProgress => rawProgress as UploadProgress | null))
      )

      subscription.add(
        progress$.subscribe({
          next: progress => {
            if (generation !== uploadGenerationRef.current) return
            setUploadState({ progress })

            console.log('[upload:progress]', progress)

            if (progress.completed) {
              if (progress.error) {
                console.error('[upload:progress] upload failed', progress.error)
              } else {
                console.log('[upload:progress] upload complete')
                if (uploadState.uploadSource === 'report') {
                  clearReportDraft(uploadPrincipalIdRef.current)
                }
              }
              uploadInFlightRef.current = false
              setUploadState({ isUploading: false })
            }
          },
          error: error => {
            if (generation !== uploadGenerationRef.current) return
            console.error('[upload:progress] upload status is unknown', error)
            uploadInFlightRef.current = false
            setUploadState({
              isUploading: false,
              progress: null,
              statusUnknown: true,
              uploadRef: null,
            })
          },
        })
      )
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [
    clearReportDraft,
    setUploadState,
    uploadState.uploadRef,
    uploadState.uploadSource,
    uploadState.isUploading,
  ])

  const setPrivacyOverrides = useCallback((overrides: PrivacyOverrides) => {
    privacyOverridesRef.current = overrides
  }, [])

  const value = useMemo(
    () => ({
      uploadState,
      uploadPrincipalId,
      uploadReservation,
      reserveUpload,
      releaseUploadReservation,
      enqueueUpload,
      reportDraft,
      reportDraftPrincipalId,
      setReportDraft,
      setUploadTitle,
      setPrivacyOverrides,
    }),
    [
      uploadState,
      uploadPrincipalId,
      uploadReservation,
      reserveUpload,
      releaseUploadReservation,
      enqueueUpload,
      reportDraft,
      reportDraftPrincipalId,
      setReportDraft,
      setUploadTitle,
      setPrivacyOverrides,
    ]
  )

  return (
    <CaptureUploadContext.Provider value={value}>
      {children}
    </CaptureUploadContext.Provider>
  )
}
