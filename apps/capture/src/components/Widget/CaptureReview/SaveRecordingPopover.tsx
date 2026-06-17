import { Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import {
  /* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-color, @repro/oxlint-plugin-design/no-hardcoded-spacing */
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
import { type Cancel, fork } from 'fluture'
import { CloudUploadIcon, LockIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCaptureUpload } from './CaptureUploadProvider'

const CREATE_SENTINEL = '__create__'

interface ProjectCreateResponse {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
}

interface SaveRecordingPopoverProps {
  isAuthed: boolean
}

export const SaveRecordingPopover: React.FC<SaveRecordingPopoverProps> = ({
  isAuthed,
}) => {
  const session = useSession()
  const apiClient = useApiClient()
  const apiClientRef = useRef(apiClient)
  apiClientRef.current = apiClient

  const { enqueueUpload, uploadState } = useCaptureUpload()
  const isUploading = uploadState.isUploading

  const [savePopoverOpen, setSavePopoverOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')

  // Local project state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  )
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  const fetchCancelRef = useRef<Cancel | null>(null)

  useEffect(() => {
    if (!session || !savePopoverOpen) {
      return
    }

    setProjectsLoading(true)

    fetchCancelRef.current = fork((_error: Error) => {
      setProjectsLoading(false)
      setProjects([])
    })((data: { items: Project[] }) => {
      setProjectsLoading(false)
      setProjects(data.items)
    })(apiClientRef.current.fetch('/projects'))

    return () => {
      fetchCancelRef.current?.()
    }
  }, [refetchTrigger, session, savePopoverOpen])

  // Create form state
  const [createMode, setCreateMode] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const createCancelRef = useRef<Cancel | null>(null)

  useEffect(() => {
    return () => {
      createCancelRef.current?.()
    }
  }, [])

  const handleSave = useCallback(() => {
    if (selectedProjectId !== null) {
      enqueueUpload(selectedProjectId, saveTitle, null)
      setSavePopoverOpen(false)
    } else if (createMode && newProjectName.trim()) {
      setCreating(true)
      setCreateError(null)

      const name = newProjectName.trim()

      createCancelRef.current = fork((_error: Error) => {
        setCreating(false)
        setCreateError('Failed to create project. Please try again.')
      })((data: ProjectCreateResponse) => {
        setCreating(false)
        setNewProjectName('')
        setCreateMode(false)
        if (data && data.id) {
          enqueueUpload(data.id, saveTitle, null)
          setSelectedProjectId(data.id)
          setRefetchTrigger(t => t + 1)
          setSavePopoverOpen(false)
        }
      })(
        apiClientRef.current.fetch('/projects', {
          method: 'POST',
          body: JSON.stringify({ name }),
        })
      )
    }
  }, [enqueueUpload, saveTitle, selectedProjectId, createMode, newProjectName])

  const handleSelectChange = useCallback((value: string) => {
    if (value === CREATE_SENTINEL) {
      setCreateMode(true)
      setNewProjectName('')
      setCreateError(null)
    } else {
      setSelectedProjectId(value)
      setCreateMode(false)
    }
  }, [])

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
          gap={4}
          paddingH={12}
          paddingV={8}
          backgroundColor="rgba(255, 255, 255, 0.1)"
          color={color.infoTint}
          hoverBackgroundColor={
            isAuthed && !isUploading ? color.infoFg : undefined
          }
          borderRadius={2}
          transition="all 100ms ease-in-out"
          lineHeight={1}
          userSelect="none"
          cursor={isAuthed && !isUploading ? 'pointer' : 'not-allowed'}
          opacity={!isAuthed || isUploading ? 0.4 : 1}
        >
          <Tooltip>
            {isAuthed ? (
              'Save recording to project'
            ) : (
              <Row alignItems="center" gap={4} display="inline-flex">
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

          {/* Project selection — always visible when projects exist */}
          <Col gap={spacing.sm} marginBottom={spacing.lg}>
            <FormField>
              <Label>Project</Label>
              {projectsLoading ? (
                <Select
                  size="small"
                  value=""
                  onChange={() => {}}
                  options={[]}
                  placeholder="Loading projects…"
                  disabled
                  aria-label="Select project"
                />
              ) : projects.length > 0 ? (
                <Select
                  size="small"
                  value={selectedProjectId ?? ''}
                  onChange={handleSelectChange}
                  options={[
                    ...projects.map(p => ({
                      value: p.id,
                      label: p.name,
                    })),
                    { value: CREATE_SENTINEL, label: 'Create new project…' },
                  ]}
                  placeholder="Select a project…"
                  aria-label="Select project"
                />
              ) : null}
            </FormField>

            {/* Inline project name input (visible in create mode or when no projects exist) */}
            {(createMode || (projects.length === 0 && !projectsLoading)) && (
              <Col gap={spacing.sm}>
                <Input
                  size="small"
                  value={newProjectName}
                  onChange={e =>
                    setNewProjectName((e.target as HTMLInputElement).value)
                  }
                  placeholder="Project name"
                />
                {createError && (
                  <Text variant="caption" color={color.danger}>
                    {createError}
                  </Text>
                )}
              </Col>
            )}
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
                (!selectedProjectId &&
                  !(createMode && newProjectName.trim())) ||
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
/* eslint-enable */
