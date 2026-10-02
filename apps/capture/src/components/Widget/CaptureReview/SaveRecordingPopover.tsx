import { Col, Row } from '@jsxstyle/react'
import { useSession } from '@repro/auth'
import {
  Alert,
  Button,
  FormField,
  Input,
  Label,
  Popover,
  Text,
  Tooltip,
  color,
  lineHeight,
  spacing,
} from '@repro/design'
import { type Cancel, fork } from 'fluture'
import { CloudUploadIcon, LockIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCaptureUpload } from './CaptureUploadProvider'
import {
  type ProjectChoice,
  ProjectSelection,
  useProjectCatalog,
} from './ProjectSelection'

interface SaveRecordingPopoverProps {
  isAuthed: boolean
}

const SAVE_RESERVATION_WAIT_MESSAGE =
  'A report is preparing an upload. Wait for it to finish before saving this recording.'
const SAVE_UPLOAD_RETRY_MESSAGE =
  'Another upload is being prepared or active. Wait for it to finish, then try again.'

export const SaveRecordingPopover: React.FC<SaveRecordingPopoverProps> = ({
  isAuthed,
}) => {
  const session = useSession()
  const {
    enqueueUpload,
    reserveUpload,
    releaseUploadReservation,
    setUploadTitle,
    uploadState,
    uploadPrincipalId,
    uploadReservation,
  } = useCaptureUpload()
  const principalId = session?.id ?? null
  const principalIdRef = useRef(principalId)
  principalIdRef.current = principalId
  const ownsRetainedSave =
    uploadPrincipalId !== null && uploadPrincipalId === principalId
  const foreignUpload =
    uploadPrincipalId !== null &&
    uploadPrincipalId !== principalId &&
    (uploadState.isUploading ||
      uploadState.statusUnknown ||
      uploadState.error !== null)
  const ownsUpload = uploadPrincipalId === principalId
  const hasOwnedSaveError =
    ownsRetainedSave &&
    uploadState.uploadSource === 'save-recording' &&
    uploadState.error !== null
  const isUploading = uploadState.isUploading
  const [fallbackSaveTitleState, setFallbackSaveTitleState] = useState({
    principalId,
    title: '',
  })
  const fallbackSaveTitle =
    fallbackSaveTitleState.principalId === principalId
      ? fallbackSaveTitleState.title
      : ''
  const saveTitle =
    uploadState.uploadSource === 'save-recording' && ownsRetainedSave
      ? uploadState.uploadTitle
      : fallbackSaveTitle
  const blockedByUnknownReport =
    uploadState.statusUnknown && uploadState.uploadSource === 'report'
  const isSaveDisabled =
    !isAuthed ||
    isUploading ||
    uploadReservation !== null ||
    blockedByUnknownReport ||
    foreignUpload

  const [savePopoverOpen, setSavePopoverOpen] = useState(false)

  useEffect(() => {
    if (blockedByUnknownReport || foreignUpload) setSavePopoverOpen(false)
  }, [blockedByUnknownReport, foreignUpload])

  useEffect(() => {
    if (
      uploadState.statusUnknown &&
      uploadState.uploadSource === 'save-recording' &&
      !foreignUpload
    ) {
      setSavePopoverOpen(true)
    }
  }, [foreignUpload, uploadState.statusUnknown, uploadState.uploadSource])

  useEffect(() => {
    if (hasOwnedSaveError) setSavePopoverOpen(true)
  }, [hasOwnedSaveError])

  const [projectChoiceState, setProjectChoiceState] = useState<{
    principalId: string | null
    choice: ProjectChoice
  }>({ principalId, choice: null })
  const setProjectChoice = useCallback(
    (choice: ProjectChoice) => setProjectChoiceState({ principalId, choice }),
    [principalId]
  )
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const createCancelRef = useRef<Cancel | null>(null)
  const projectReservationRef = useRef<number | null>(null)

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
  const projectCatalogActive =
    session !== null &&
    !foreignUpload &&
    (savePopoverOpen ||
      (uploadState.uploadSource === 'save-recording' &&
        (isUploading || uploadState.statusUnknown || hasOwnedSaveError)))
  const {
    projects,
    projectsLoading,
    projectsError,
    createProject,
    refetchProjects,
  } = useProjectCatalog(projectCatalogActive)
  const restoredProjectChoice: ProjectChoice =
    (uploadState.statusUnknown || hasOwnedSaveError) &&
    uploadState.uploadSource === 'save-recording' &&
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

  useEffect(() => {
    if (projectChoiceState.principalId === principalId) return
    createCancelRef.current?.()
    createCancelRef.current = null
    if (projectReservationRef.current !== null) {
      finishProjectReservation(projectReservationRef.current)
    }
    setProjectChoiceState({ principalId, choice: null })
    setCreateError(null)
    setCreating(false)
  }, [finishProjectReservation, principalId, projectChoiceState.principalId])

  useEffect(() => {
    if (
      !projectsLoading &&
      !projectsError &&
      projectChoice?.type === 'existing' &&
      !projects.some(project => project.id === projectChoice.projectId)
    ) {
      setProjectChoice(null)
      setCreateError(
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
    return () => {
      const reservationId = projectReservationRef.current
      createCancelRef.current?.()
      if (reservationId !== null) finishProjectReservation(reservationId)
    }
  }, [finishProjectReservation])

  const handleSave = useCallback(() => {
    if (uploadReservation !== null) {
      setCreateError(
        uploadReservation.source === 'report' &&
          uploadReservation.principalId === principalId
          ? SAVE_RESERVATION_WAIT_MESSAGE
          : SAVE_UPLOAD_RETRY_MESSAGE
      )
      return
    }
    if (projectsLoading || projectsError || isSaveDisabled) return

    if (projectChoice?.type === 'existing') {
      if (!projects.some(project => project.id === projectChoice.projectId)) {
        setProjectChoice(null)
        setCreateError(
          'The selected project is no longer available. Select another project.'
        )
        return
      }
      if (
        enqueueUpload(
          projectChoice.projectId,
          saveTitle,
          null,
          'save-recording'
        )
      ) {
        setSavePopoverOpen(false)
      } else {
        setCreateError(SAVE_UPLOAD_RETRY_MESSAGE)
      }
      return
    }

    if (projectChoice?.type !== 'create' || !projectChoice.name.trim()) return

    setCreateError(null)
    const name = projectChoice.name.trim()
    const creatingPrincipalId = principalId
    const reservationId = reserveUpload('save-recording')
    if (reservationId === null) {
      setCreateError(SAVE_UPLOAD_RETRY_MESSAGE)
      return
    }
    projectReservationRef.current = reservationId
    setCreating(true)

    try {
      const cancel = fork(() => {
        finishProjectReservation(reservationId)
        if (principalIdRef.current !== creatingPrincipalId) return
        setCreating(false)
        setCreateError('Failed to create project. Please try again.')
      })((project: { id: string }) => {
        if (principalIdRef.current !== creatingPrincipalId) {
          finishProjectReservation(reservationId)
          return
        }
        setCreating(false)
        if (!project.id) {
          finishProjectReservation(reservationId)
          setCreateError('Failed to create project. Please try again.')
          return
        }
        setProjectChoice({ type: 'existing', projectId: project.id })
        const enqueued = enqueueUpload(
          project.id,
          saveTitle,
          null,
          'save-recording',
          reservationId
        )
        finishProjectReservation(reservationId)
        if (enqueued) {
          refetchProjects()
          setSavePopoverOpen(false)
        } else {
          setCreateError(SAVE_UPLOAD_RETRY_MESSAGE)
        }
      })(createProject(name))
      if (projectReservationRef.current === reservationId) {
        createCancelRef.current = cancel
      }
    } catch {
      finishProjectReservation(reservationId)
      if (principalIdRef.current === creatingPrincipalId) {
        setCreating(false)
        setCreateError('Failed to create project. Please try again.')
      }
    }
  }, [
    createProject,
    enqueueUpload,
    finishProjectReservation,
    isSaveDisabled,
    principalId,
    projectChoice,
    reserveUpload,
    setProjectChoice,
    projects,
    projectsError,
    projectsLoading,
    refetchProjects,
    saveTitle,
    uploadReservation,
  ])

  return (
    <Popover
      open={savePopoverOpen && !blockedByUnknownReport && !foreignUpload}
      onOpenChange={open => {
        if (open && isSaveDisabled) return
        setSavePopoverOpen(open)
      }}
    >
      <Popover.Trigger>
        <Row
          component="button"
          type="button"
          disabled={isSaveDisabled}
          alignItems="center"
          gap={spacing.sm}
          paddingH={spacing.lg}
          paddingV={spacing.md}
          // eslint-disable-next-line @repro/oxlint-plugin-design/no-hardcoded-color -- transparent white glass tint over header, no exact token equivalent
          backgroundColor="rgba(255, 255, 255, 0.1)"
          color={color.infoTint}
          hoverBackgroundColor={!isSaveDisabled ? color.infoFg : undefined}
          borderRadius={2}
          border="none"
          transition="all 100ms ease-in-out"
          font="inherit"
          lineHeight={lineHeight.tight}
          userSelect="none"
          cursor={isSaveDisabled ? 'not-allowed' : 'pointer'}
          opacity={isSaveDisabled ? 0.4 : 1}
        >
          <Tooltip>
            {uploadReservation?.source === 'report' &&
            uploadReservation.principalId === principalId ? (
              SAVE_RESERVATION_WAIT_MESSAGE
            ) : isAuthed ? (
              blockedByUnknownReport ? (
                'Retry the report before saving this recording'
              ) : (
                'Save recording to project'
              )
            ) : (
              <Row alignItems="center" gap={spacing.sm} display="inline-flex">
                <LockIcon size={12} /> Sign in to save
              </Row>
            )}
          </Tooltip>
          <CloudUploadIcon size={16} />
          Save
        </Row>
      </Popover.Trigger>

      {!foreignUpload && (
        <Popover.Content
          aria-label="Save recording"
          side="bottom"
          align="end"
          style={{ outline: 'none' }}
        >
          <Col gap={spacing.md} minWidth={260}>
            <Text variant="heading3">Save recording</Text>

            {hasOwnedSaveError && (
              <Alert type="danger">
                Recording could not be saved. Your connection may have dropped.
                Check it and try again.
              </Alert>
            )}

            {uploadState.statusUnknown &&
              ownsUpload &&
              uploadState.uploadSource === 'save-recording' && (
                <Alert type="warning">
                  The recording may already be in your project. Check before
                  retrying; retrying anyway may create a duplicate.
                </Alert>
              )}

            {uploadReservation?.source === 'report' &&
              uploadReservation.principalId === principalId && (
                <Alert type="info">{SAVE_RESERVATION_WAIT_MESSAGE}</Alert>
              )}

            <Col gap={spacing.sm} marginBottom={spacing.lg}>
              <ProjectSelection
                ariaLabel="Select project"
                value={projectChoice}
                onChange={choice => {
                  setProjectChoice(choice)
                  setCreateError(null)
                }}
                projects={projects}
                projectsLoading={projectsLoading}
                projectsError={projectsError}
                onRetry={refetchProjects}
                disabled={isSaveDisabled}
                creating={creating}
                error={createError}
              />
            </Col>

            {/* Title */}
            <FormField>
              <Label>Title</Label>
              <Input
                value={saveTitle}
                onChange={e => {
                  const title = (e.target as HTMLInputElement).value
                  setFallbackSaveTitleState({ principalId, title })
                  if (
                    ownsRetainedSave &&
                    uploadState.uploadSource === 'save-recording'
                  ) {
                    setUploadTitle(title)
                  }
                }}
                size="small"
                placeholder="What did you record?"
                autoFocus={true}
                disabled={isSaveDisabled}
              />
            </FormField>

            <Row justifyContent="flex-end">
              <Button
                variant="contained"
                size="small"
                disabled={
                  !(
                    (projectChoice?.type === 'existing' &&
                      projects.some(
                        project => project.id === projectChoice.projectId
                      )) ||
                    (projectChoice?.type === 'create' &&
                      projectChoice.name.trim().length > 0)
                  ) ||
                  isSaveDisabled ||
                  creating ||
                  projectsLoading ||
                  projectsError ||
                  !saveTitle.trim()
                }
                onClick={handleSave}
              >
                {ownsUpload &&
                uploadState.uploadSource === 'save-recording' &&
                uploadState.statusUnknown
                  ? 'Retry save anyway'
                  : hasOwnedSaveError
                  ? 'Retry save'
                  : 'Save'}
              </Button>
            </Row>
          </Col>
          <Popover.Arrow />
        </Popover.Content>
      )}
    </Popover>
  )
}
