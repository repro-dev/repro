import { Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import {
  Button,
  FormField,
  Input,
  Label,
  Popover,
  Select,
  Text,
  Tooltip,
  color,
  spacing,
} from '@repro/design'
import { usePlayback } from '@repro/playback'
import { fork } from 'fluture'
import { CloudUploadIcon, DownloadIcon, LockIcon, PlusIcon } from 'lucide-react'
import React, { useCallback, useState } from 'react'
import { useRecordingMode } from '~/state'
import { Modal } from '../Modal'
import { CaptureReview } from './CaptureReview'
import { useRecordingActions } from './useRecordingActions'

const DEFAULT_SELECTED_DURATION = 60_000

interface CaptureModalProps {
  open: boolean
  projects: Array<{ id: string; name: string }>
  selectedProjectId: string | null
  onProjectSelect: (projectId: string | null) => void
  onProjectCreated: (projectId: string) => void
  onClose: () => void
}

export const CaptureModal: React.FC<CaptureModalProps> = ({
  open,
  projects,
  selectedProjectId,
  onProjectSelect,
  onProjectCreated,
  onClose,
}) => {
  const playback = usePlayback()
  const session = useSession()
  const apiClient = useApiClient()
  const [recordingMode] = useRecordingMode()
  const [selectedDuration, setSelectedDuration] = useState(
    DEFAULT_SELECTED_DURATION
  )
  const [savePopoverOpen, setSavePopoverOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')

  const [createMode, setCreateMode] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const actions = useRecordingActions(
    playback,
    selectedProjectId,
    recordingMode,
    selectedDuration
  )

  const canSave = session !== null && selectedProjectId !== null

  const onDownloadLocally = useCallback(() => {
    actions.downloadLocally()
  }, [actions])

  const onSaveSubmit = useCallback(() => {
    actions.enqueueUpload({ title: saveTitle, description: null })
    setSavePopoverOpen(false)
  }, [actions, saveTitle])

  const onCreateProject = useCallback(() => {
    const name = newProjectName.trim()
    if (!name) return

    setCreating(true)
    setCreateError(null)

    fork((_error: Error) => {
      setCreating(false)
      setCreateError('Failed to create project. Please try again.')
    })((data: any) => {
      setCreating(false)
      setNewProjectName('')
      setCreateMode(false)
      onProjectCreated(data.id)
    })(
      apiClient.fetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
    )
  }, [apiClient, newProjectName, onProjectCreated])

  const projectSelector =
    session !== null ? (
      <Row alignItems="center" gap={spacing.sm}>
        {projects.length > 0 && !createMode && (
          <>
            <Select
              size="small"
              value={selectedProjectId ?? ''}
              onChange={value => onProjectSelect(value)}
              options={projects.map(p => ({
                value: p.id,
                label: p.name,
              }))}
              placeholder="Select a project…"
              aria-label="Select project"
            />
            <Tooltip>Create new project</Tooltip>
            <Row
              component="button"
              alignItems="center"
              justifyContent="center"
              width={24}
              height={24}
              backgroundColor="rgba(255, 255, 255, 0.1)"
              color={color.infoTint}
              hoverBackgroundColor={color.infoFg}
              borderRadius={2}
              cursor="pointer"
              lineHeight={1}
              transition="all 100ms ease-in-out"
              flexShrink={0}
              props={{
                onClick: () => setCreateMode(true),
                type: 'button',
                'aria-label': 'Create new project',
              }}
            >
              <PlusIcon size={14} />
            </Row>
          </>
        )}

        {projects.length === 0 || createMode ? (
          <Col gap={spacing.xs}>
            <Row alignItems="center" gap={spacing.sm}>
              <Input
                size="small"
                value={newProjectName}
                onChange={e =>
                  setNewProjectName((e.target as HTMLInputElement).value)
                }
                placeholder="Project name"
              />
              <Button
                size="small"
                variant="contained"
                disabled={creating || !newProjectName.trim()}
                onClick={onCreateProject}
              >
                Create
              </Button>
            </Row>
            {createError && (
              <Text variant="caption" color={color.danger}>
                {createError}
              </Text>
            )}
          </Col>
        ) : null}
      </Row>
    ) : null

  const headerActions = (
    <>
      {projectSelector}

      <Row
        alignItems="center"
        paddingH={12}
        paddingV={8}
        backgroundColor="rgba(255, 255, 255, 0.1)"
        color={color.infoTint}
        hoverBackgroundColor={color.infoFg}
        borderRadius={2}
        transition="all 100ms ease-in-out"
        lineHeight={1}
        cursor="pointer"
        userSelect="none"
        props={{ onClick: onDownloadLocally }}
      >
        <Tooltip>Download locally</Tooltip>
        <DownloadIcon size={16} />
      </Row>

      <Popover
        open={savePopoverOpen}
        onOpenChange={open => {
          if (open && (!canSave || actions.uploadState.isUploading)) return
          setSavePopoverOpen(open)
        }}
      >
        <Popover.Trigger>
          <Row
            alignItems="center"
            gap={4}
            paddingH={12}
            paddingV={8}
            backgroundColor="rgba(255, 255, 255, 0.1)"
            color={color.infoTint}
            hoverBackgroundColor={
              canSave && !actions.uploadState.isUploading
                ? color.infoFg
                : undefined
            }
            borderRadius={2}
            transition="all 100ms ease-in-out"
            lineHeight={1}
            userSelect="none"
            cursor={
              canSave && !actions.uploadState.isUploading
                ? 'pointer'
                : 'not-allowed'
            }
            opacity={!canSave || actions.uploadState.isUploading ? 0.4 : 1}
          >
            <Tooltip>
              {canSave ? (
                'Save recording to project'
              ) : session === null ? (
                <Row alignItems="center" gap={4} display="inline-flex">
                  <LockIcon size={12} /> Sign in to save
                </Row>
              ) : (
                'Select or create a project to upload. You can still download locally.'
              )}
            </Tooltip>
            <CloudUploadIcon size={16} />
            Save
          </Row>
        </Popover.Trigger>

        <Popover.Content
          aria-label="Save recording"
          side="bottom"
          align="end"
          style={{ outline: 'none' }}
        >
          <Col gap={spacing.md} minWidth={260}>
            <Text variant="heading3">Save recording</Text>
            <FormField>
              <Label>Title</Label>
              <Input
                value={saveTitle}
                onChange={e =>
                  setSaveTitle((e.target as HTMLInputElement).value)
                }
                size="small"
                placeholder="What did you record?"
                autoFocus={true}
              />
            </FormField>
            <Row justifyContent="flex-end">
              <Button
                variant="contained"
                size="small"
                disabled={
                  !canSave ||
                  actions.uploadState.isUploading ||
                  !saveTitle.trim()
                }
                onClick={onSaveSubmit}
              >
                Save
              </Button>
            </Row>
          </Col>
          <Popover.Arrow />
        </Popover.Content>
      </Popover>
    </>
  )

  return (
    <Modal
      title="Session Inspector"
      size="full-screen"
      open={open}
      onClose={onClose}
      headerActions={headerActions}
    >
      <CaptureReview
        onClose={onClose}
        actions={actions}
        playback={playback}
        recordingMode={recordingMode}
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
      />
    </Modal>
  )
}
