import { Block, Col, Row } from '@jsxstyle/react'
import { useAuthContext, useSession, useSessionLoading } from '@repro/auth'
import { formatTime } from '@repro/date-utils'
import {
  Alert,
  Button,
  Text,
  ToggleGroup,
  color,
  fontSize,
  fontWeight,
  shadow,
  spacing,
} from '@repro/design'
import { DevTools, useDevToolsView } from '@repro/devtools'
import { useInspecting } from '@repro/devtools/src/hooks'
import { View } from '@repro/devtools/src/types'
import { RecordingMode } from '@repro/domain'
import { forget } from '@repro/future-utils'
import { Playback, PlaybackProvider, SimpleTimeline } from '@repro/playback'
import { findErrorAndWarningEvents } from '@repro/source-utils'
import { type Cancel, fork } from 'fluture'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DetailsFields } from '../ReportForm/DetailsFields'
import { AsideRegion, Layout, PlaybackRegion } from '../ReportForm/Layout'
import { ProgressOverlay } from '../ReportForm/ProgressOverlay'
import { useCaptureUpload } from './CaptureUploadProvider'
import { type PrivacyOverrides } from './PrivacySection'
import {
  type ProjectChoice,
  ProjectSelection,
  useProjectCatalog,
} from './ProjectSelection'

const DEFAULT_SELECTED_DURATION = 60_000
const REPORT_RESERVATION_WAIT_MESSAGE =
  'Wait for or retry Save Recording before submitting this report.'
const REPORT_ENQUEUE_FAILURE_MESSAGE =
  'Report could not be sent. Your connection may have dropped. Check it and select Retry report.'
const REPORT_UPLOAD_RETRY_MESSAGE =
  'Another upload is being prepared or active. Wait for it to finish, then try again.'

interface CaptureReviewProps {
  onClose: () => void
  playback: Playback
  recordingMode: RecordingMode
  selectedDuration: number
  setSelectedDuration: (duration: number) => void
  privacyOverrides: PrivacyOverrides
}

export const CaptureReview: React.FC<CaptureReviewProps> = ({
  onClose,
  playback,
  recordingMode,
  selectedDuration,
  setSelectedDuration,
  privacyOverrides,
}) => {
  const maxTime = playback.getDuration()
  const minTime = Math.max(0, maxTime - selectedDuration)

  const durationOptions = [
    { value: maxTime, label: `Max (${formatTime(maxTime, 'seconds')})` },
    { value: 120_000, label: 'Last 2m' },
    { value: 60_000, label: 'Last 1m' },
    { value: 30_000, label: 'Last 30s' },
    { value: 10_000, label: 'Last 10s' },
  ].filter(option => option.value <= maxTime)

  React.useEffect(() => {
    playback.seekToTime(minTime)
  }, [playback, minTime])

  React.useEffect(() => {
    setSelectedDuration(Math.min(DEFAULT_SELECTED_DURATION, maxTime))
  }, [maxTime, setSelectedDuration])

  const {
    enqueueUpload,
    reserveUpload,
    releaseUploadReservation,
    uploadState,
    uploadPrincipalId,
    uploadReservation,
    reportDraft,
    reportDraftPrincipalId,
    setReportDraft,
    setPrivacyOverrides: setUploadPrivacyOverrides,
  } = useCaptureUpload()
  const session = useSession()
  const sessionLoading = useSessionLoading()
  const authContext = useAuthContext()
  const principalId = session?.id ?? null
  const principalIdRef = useRef(principalId)
  principalIdRef.current = principalId
  const visibleReportDraft =
    reportDraftPrincipalId === null || reportDraftPrincipalId === principalId
      ? reportDraft
      : { title: '', description: '' }
  const foreignUpload =
    uploadPrincipalId !== null &&
    uploadPrincipalId !== principalId &&
    (uploadState.isUploading ||
      uploadState.statusUnknown ||
      uploadState.error !== null ||
      uploadState.progress?.completed === true)

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        forget(authContext.loadSession())
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authContext])

  const {
    projects,
    projectsLoading,
    projectsError,
    createProject,
    refetchProjects,
  } = useProjectCatalog(!sessionLoading && session !== null)
  const [projectChoiceState, setProjectChoiceState] = useState<{
    principalId: string | null
    choice: ProjectChoice
  }>({ principalId, choice: null })
  const restoreReportProject =
    (uploadState.statusUnknown && uploadState.uploadSource === 'report') ||
    (uploadPrincipalId === principalId &&
      uploadState.uploadSource === 'report' &&
      uploadState.error !== null)
  const restoredProjectChoice: ProjectChoice =
    restoreReportProject &&
    !projectsLoading &&
    !projectsError &&
    uploadState.uploadProjectId &&
    projects.some(project => project.id === uploadState.uploadProjectId)
      ? { type: 'existing', projectId: uploadState.uploadProjectId }
      : null
  const projectChoice =
    projectChoiceState.principalId === principalId
      ? projectChoiceState.choice ?? restoredProjectChoice
      : restoredProjectChoice
  const setProjectChoice = useCallback(
    (choice: ProjectChoice) => setProjectChoiceState({ principalId, choice }),
    [principalId]
  )
  const [projectError, setProjectError] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [showSignInPrompt, setShowSignInPrompt] = useState(false)
  const createCancelRef = useRef<Cancel | null>(null)
  const projectReservationRef = useRef<number | null>(null)
  const signInButtonRef = useRef<HTMLButtonElement | null>(null)

  const finishProjectReservation = useCallback(
    (id: number) => {
      if (projectReservationRef.current === id) {
        projectReservationRef.current = null
        createCancelRef.current = null
      }
      releaseUploadReservation(id)
    },
    [releaseUploadReservation]
  )

  useEffect(() => {
    return () => {
      const reservationId = projectReservationRef.current
      createCancelRef.current?.()
      if (reservationId !== null) finishProjectReservation(reservationId)
    }
  }, [finishProjectReservation])

  useEffect(() => {
    if (projectChoiceState.principalId === principalId) return
    createCancelRef.current?.()
    createCancelRef.current = null
    if (projectReservationRef.current !== null) {
      finishProjectReservation(projectReservationRef.current)
    }
    setProjectChoiceState({ principalId, choice: null })
    setProjectError(null)
    setCreatingProject(false)
  }, [finishProjectReservation, principalId, projectChoiceState.principalId])

  useEffect(() => {
    if (
      !projectsLoading &&
      !projectsError &&
      projectChoice?.type === 'existing' &&
      !projects.some(project => project.id === projectChoice.projectId)
    ) {
      setProjectChoice(null)
      setProjectError(
        'The selected project is no longer available. Select another project.'
      )
    }
  }, [
    projectChoice,
    projects,
    projectsError,
    projectsLoading,
    setProjectChoice,
  ])

  useEffect(() => {
    if (showSignInPrompt) signInButtonRef.current?.focus()
  }, [showSignInPrompt])

  const projectReady =
    (projectChoice?.type === 'existing' &&
      projects.some(project => project.id === projectChoice.projectId)) ||
    (projectChoice?.type === 'create' && projectChoice.name.trim().length > 0)
  const reportSubmissionBlockedByUnknownSave =
    uploadState.statusUnknown && uploadState.uploadSource === 'save-recording'
  const reportBlockedBySaveError =
    uploadPrincipalId === principalId &&
    uploadState.uploadSource === 'save-recording' &&
    uploadState.error !== null
  const submitDisabled =
    sessionLoading ||
    creatingProject ||
    uploadState.isUploading ||
    uploadReservation !== null ||
    foreignUpload ||
    reportSubmissionBlockedByUnknownSave ||
    reportBlockedBySaveError ||
    (session !== null && (projectsLoading || projectsError || !projectReady))

  const handleSignIn = useCallback(() => {
    window.open(
      `${process.env.REPRO_APP_URL}${authContext.loginPath}`,
      '_blank',
      'noopener,noreferrer'
    )
  }, [authContext.loginPath])

  const handleReportSubmit = useCallback(
    (details: { title: string; description: string }) => {
      if (
        sessionLoading ||
        foreignUpload ||
        reportSubmissionBlockedByUnknownSave ||
        reportBlockedBySaveError
      ) {
        return
      }

      if (uploadReservation !== null) {
        setProjectError(
          uploadReservation.source === 'save-recording' &&
            uploadReservation.principalId === principalId
            ? REPORT_RESERVATION_WAIT_MESSAGE
            : REPORT_UPLOAD_RETRY_MESSAGE
        )
        return
      }

      if (session === null) {
        setShowSignInPrompt(true)
        return
      }

      if (projectsLoading || projectsError) return

      setShowSignInPrompt(false)
      setProjectError(null)

      if (projectChoice?.type === 'existing') {
        if (!projects.some(project => project.id === projectChoice.projectId)) {
          setProjectChoice(null)
          setProjectError(
            'The selected project is no longer available. Select another project.'
          )
          return
        }
        const enqueued = enqueueUpload(
          projectChoice.projectId,
          details.title,
          details.description,
          'report'
        )
        if (!enqueued) setProjectError(REPORT_UPLOAD_RETRY_MESSAGE)
        return
      }

      if (projectChoice?.type !== 'create' || !projectChoice.name.trim()) {
        setProjectError('Select or create a project before submitting.')
        return
      }

      const name = projectChoice.name.trim()
      const creatingPrincipalId = principalId
      const reservationId = reserveUpload('report')
      if (reservationId === null) {
        setProjectError(REPORT_UPLOAD_RETRY_MESSAGE)
        return
      }
      projectReservationRef.current = reservationId
      setCreatingProject(true)

      try {
        const cancel = fork(() => {
          finishProjectReservation(reservationId)
          if (principalIdRef.current !== creatingPrincipalId) return
          setCreatingProject(false)
          setProjectError('Failed to create project. Please try again.')
        })((project: { id: string }) => {
          if (principalIdRef.current !== creatingPrincipalId) {
            finishProjectReservation(reservationId)
            return
          }
          setCreatingProject(false)
          if (!project.id) {
            finishProjectReservation(reservationId)
            setProjectError('Failed to create project. Please try again.')
            return
          }
          setProjectChoice({ type: 'existing', projectId: project.id })
          const enqueued = enqueueUpload(
            project.id,
            details.title,
            details.description,
            'report',
            reservationId
          )
          finishProjectReservation(reservationId)
          if (!enqueued) setProjectError(REPORT_UPLOAD_RETRY_MESSAGE)
        })(createProject(name))
        if (projectReservationRef.current === reservationId) {
          createCancelRef.current = cancel
        }
      } catch {
        finishProjectReservation(reservationId)
        if (principalIdRef.current === creatingPrincipalId) {
          setCreatingProject(false)
          setProjectError('Failed to create project. Please try again.')
        }
      }
    },
    [
      createProject,
      enqueueUpload,
      finishProjectReservation,
      foreignUpload,
      principalId,
      projectChoice,
      reserveUpload,
      uploadReservation,
      setProjectChoice,
      reportSubmissionBlockedByUnknownSave,
      reportBlockedBySaveError,
      projectsError,
      projectsLoading,
      projects,
      session,
      sessionLoading,
    ]
  )

  // Sync privacy overrides into the upload provider so its enqueueUpload
  // includes them in the upload payload. Actual event transforms happen
  // at save/download time (tracked in a follow-up issue).
  useEffect(() => {
    setUploadPrivacyOverrides(privacyOverrides)
  }, [privacyOverrides, setUploadPrivacyOverrides])

  const [, setView] = useDevToolsView()
  const [, setInspecting] = useInspecting()

  const errorAndWarningEvents = useMemo(
    () => findErrorAndWarningEvents(playback.getSourceEvents()),
    [playback]
  )

  const handleMarkerClick = (_: unknown) => {
    setView(View.Console)
    setInspecting(true)
  }

  return (
    <PlaybackProvider playback={playback}>
      <Layout>
        <PlaybackRegion>
          {recordingMode === RecordingMode.Replay &&
          durationOptions.length > 1 ? (
            <Row
              gap={spacing.md}
              alignItems="center"
              justifyContent="flex-end"
              padding={spacing.md}
              zIndex={1}
              boxShadow={shadow.md}
            >
              <Block
                fontSize={fontSize.xs}
                fontWeight={fontWeight.bold}
                color={color.text.secondary}
              >
                Duration
              </Block>

              <ToggleGroup
                options={durationOptions}
                selected={selectedDuration}
                onChange={setSelectedDuration}
              />
            </Row>
          ) : (
            <Block />
          )}

          <DevTools
            hideInspectorOnOpen
            timeline={
              <SimpleTimeline
                min={minTime}
                max={maxTime}
                errorAndWarningEvents={errorAndWarningEvents}
                onMarkerClick={handleMarkerClick}
              />
            }
          />
        </PlaybackRegion>

        <AsideRegion>
          <Col
            gap={spacing['2xl']}
            padding={spacing.xl}
            height="100%"
            overflowY="auto"
          >
            <Text variant="heading3">Create bug report</Text>

            {foreignUpload ? (
              <Alert type="warning">
                This upload belongs to another account. Sign in with the account
                that started it to review its status or retry it.
              </Alert>
            ) : (
              <>
                <ProjectSelection
                  ariaLabel="Report project"
                  value={projectChoice}
                  onChange={choice => {
                    setProjectChoice(choice)
                    setProjectError(null)
                  }}
                  projects={projects}
                  projectsLoading={projectsLoading}
                  projectsError={projectsError}
                  onRetry={refetchProjects}
                  disabled={
                    sessionLoading ||
                    session === null ||
                    uploadState.isUploading ||
                    uploadReservation !== null ||
                    reportSubmissionBlockedByUnknownSave ||
                    reportBlockedBySaveError
                  }
                  creating={creatingProject}
                  error={projectError}
                />

                {uploadReservation?.source === 'save-recording' &&
                  uploadReservation.principalId === principalId && (
                    <Alert type="info">{REPORT_RESERVATION_WAIT_MESSAGE}</Alert>
                  )}

                {reportBlockedBySaveError && (
                  <Alert type="info">{REPORT_RESERVATION_WAIT_MESSAGE}</Alert>
                )}

                {uploadState.statusUnknown &&
                  uploadPrincipalId === principalId &&
                  uploadState.uploadSource === 'report' && (
                    <Alert type="warning">
                      This report may already be in your project. Check before
                      retrying to avoid a duplicate.
                    </Alert>
                  )}

                <DetailsFields
                  key={`${principalId ?? 'signed-out'}:${
                    reportDraftPrincipalId ?? 'unowned'
                  }`}
                  onSubmit={handleReportSubmit}
                  initialValues={visibleReportDraft}
                  onValuesChange={setReportDraft}
                  disabled={
                    uploadState.isUploading || uploadReservation !== null
                  }
                  submitDisabled={submitDisabled}
                  submitLabel={
                    uploadPrincipalId === principalId &&
                    uploadState.uploadSource === 'report' &&
                    uploadState.statusUnknown
                      ? 'Retry report anyway'
                      : uploadPrincipalId === principalId &&
                        uploadState.uploadSource === 'report' &&
                        uploadState.error
                      ? 'Retry report'
                      : undefined
                  }
                />

                {uploadPrincipalId === principalId &&
                  uploadState.uploadSource === 'report' &&
                  uploadState.error && (
                    <Alert type="danger">
                      {REPORT_ENQUEUE_FAILURE_MESSAGE}
                    </Alert>
                  )}
              </>
            )}

            {showSignInPrompt && (
              <Alert type="info">
                <Col gap={spacing.md} alignItems="flex-start">
                  <Block>
                    Sign in to Repro before submitting. Your report details will
                    stay in place.
                  </Block>
                  <Button
                    ref={signInButtonRef}
                    variant="contained"
                    size="small"
                    onClick={handleSignIn}
                  >
                    Sign in
                  </Button>
                </Col>
              </Alert>
            )}
          </Col>
        </AsideRegion>

        {uploadState.progress && uploadPrincipalId === principalId && (
          <ProgressOverlay
            progress={uploadState.progress}
            projectId={uploadState.uploadProjectId}
            onClose={onClose}
          />
        )}
      </Layout>
    </PlaybackProvider>
  )
}
