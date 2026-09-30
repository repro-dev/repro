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
    uploadState,
    setPrivacyOverrides: setUploadPrivacyOverrides,
  } = useCaptureUpload()
  const session = useSession()
  const sessionLoading = useSessionLoading()
  const authContext = useAuthContext()

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

  const { projects, projectsLoading, createProject } = useProjectCatalog(
    !sessionLoading && session !== null
  )
  const [projectChoice, setProjectChoice] = useState<ProjectChoice>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [showSignInPrompt, setShowSignInPrompt] = useState(false)
  const createCancelRef = useRef<Cancel | null>(null)
  const signInButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    return () => createCancelRef.current?.()
  }, [])

  useEffect(() => {
    if (showSignInPrompt) signInButtonRef.current?.focus()
  }, [showSignInPrompt])

  const projectReady =
    projectChoice?.type === 'existing' ||
    (projectChoice?.type === 'create' && projectChoice.name.trim().length > 0)
  const submitDisabled =
    sessionLoading ||
    creatingProject ||
    uploadState.isUploading ||
    (session !== null && !projectReady)

  const handleSignIn = useCallback(() => {
    window.open(
      `${process.env.REPRO_APP_URL}${authContext.loginPath}`,
      '_blank',
      'noopener,noreferrer'
    )
  }, [authContext.loginPath])

  const handleReportSubmit = useCallback(
    (details: { title: string; description: string }) => {
      if (sessionLoading) return

      if (session === null) {
        setShowSignInPrompt(true)
        return
      }

      setShowSignInPrompt(false)
      setProjectError(null)

      if (projectChoice?.type === 'existing') {
        enqueueUpload(
          projectChoice.projectId,
          details.title,
          details.description
        )
        return
      }

      if (projectChoice?.type !== 'create' || !projectChoice.name.trim()) {
        setProjectError('Select or create a project before submitting.')
        return
      }

      setCreatingProject(true)
      const name = projectChoice.name.trim()
      createCancelRef.current = fork(() => {
        setCreatingProject(false)
        setProjectError('Failed to create project. Please try again.')
      })((project: { id: string }) => {
        setCreatingProject(false)
        if (!project.id) {
          setProjectError('Failed to create project. Please try again.')
          return
        }
        setProjectChoice({ type: 'existing', projectId: project.id })
        enqueueUpload(project.id, details.title, details.description)
      })(createProject(name))
    },
    [createProject, enqueueUpload, projectChoice, session, sessionLoading]
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

            <ProjectSelection
              ariaLabel="Report project"
              value={projectChoice}
              onChange={choice => {
                setProjectChoice(choice)
                setProjectError(null)
              }}
              projects={projects}
              projectsLoading={projectsLoading}
              disabled={
                sessionLoading || session === null || uploadState.isUploading
              }
              creating={creatingProject}
              error={projectError}
            />

            <DetailsFields
              onSubmit={handleReportSubmit}
              disabled={submitDisabled}
            />

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

        {uploadState.progress && (
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
