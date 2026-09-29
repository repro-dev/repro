import { Col, Row } from '@jsxstyle/react'
import { useSession } from '@repro/auth'
import {
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

export const SaveRecordingPopover: React.FC<SaveRecordingPopoverProps> = ({
  isAuthed,
}) => {
  const session = useSession()
  const { enqueueUpload, uploadState } = useCaptureUpload()
  const isUploading = uploadState.isUploading

  const [savePopoverOpen, setSavePopoverOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [projectChoice, setProjectChoice] = useState<ProjectChoice>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const createCancelRef = useRef<Cancel | null>(null)
  const { projects, projectsLoading, createProject, refetchProjects } =
    useProjectCatalog(session !== null && savePopoverOpen)

  useEffect(() => {
    return () => {
      createCancelRef.current?.()
    }
  }, [])

  const handleSave = useCallback(() => {
    if (projectChoice?.type === 'existing') {
      enqueueUpload(projectChoice.projectId, saveTitle, null)
      setSavePopoverOpen(false)
      return
    }

    if (projectChoice?.type !== 'create' || !projectChoice.name.trim()) return

    setCreating(true)
    setCreateError(null)
    const name = projectChoice.name.trim()

    createCancelRef.current = fork(() => {
      setCreating(false)
      setCreateError('Failed to create project. Please try again.')
    })((project: { id: string }) => {
      setCreating(false)
      if (!project.id) {
        setCreateError('Failed to create project. Please try again.')
        return
      }
      enqueueUpload(project.id, saveTitle, null)
      setProjectChoice({ type: 'existing', projectId: project.id })
      refetchProjects()
      setSavePopoverOpen(false)
    })(createProject(name))
  }, [createProject, enqueueUpload, projectChoice, refetchProjects, saveTitle])

  return (
    <Popover
      open={savePopoverOpen}
      onOpenChange={open => {
        if (open && !isAuthed) return
        setSavePopoverOpen(open)
      }}
    >
      <Popover.Trigger>
        <Row
          alignItems="center"
          gap={spacing.sm}
          paddingH={spacing.lg}
          paddingV={spacing.md}
          // eslint-disable-next-line @repro/oxlint-plugin-design/no-hardcoded-color -- transparent white glass tint over header, no exact token equivalent
          backgroundColor="rgba(255, 255, 255, 0.1)"
          color={color.infoTint}
          hoverBackgroundColor={
            isAuthed && !isUploading ? color.infoFg : undefined
          }
          borderRadius={2}
          transition="all 100ms ease-in-out"
          lineHeight={lineHeight.tight}
          userSelect="none"
          cursor={isAuthed && !isUploading ? 'pointer' : 'not-allowed'}
          opacity={!isAuthed || isUploading ? 0.4 : 1}
        >
          <Tooltip>
            {isAuthed ? (
              'Save recording to project'
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

      <Popover.Content
        aria-label="Save recording"
        side="bottom"
        align="end"
        style={{ outline: 'none' }}
      >
        <Col gap={spacing.md} minWidth={260}>
          <Text variant="heading3">Save recording</Text>

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
              disabled={!isAuthed || isUploading}
              creating={creating}
              error={createError}
            />
          </Col>

          {/* Title */}
          <FormField>
            <Label>Title</Label>
            <Input
              value={saveTitle}
              onChange={e => setSaveTitle((e.target as HTMLInputElement).value)}
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
                !(
                  projectChoice?.type === 'existing' ||
                  (projectChoice?.type === 'create' &&
                    projectChoice.name.trim().length > 0)
                ) ||
                isUploading ||
                creating ||
                !saveTitle.trim()
              }
              onClick={handleSave}
            >
              Save
            </Button>
          </Row>
        </Col>
        <Popover.Arrow />
      </Popover.Content>
    </Popover>
  )
}
