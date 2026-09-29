import { Col } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import {
  FormField,
  Input,
  Label,
  Select,
  Text,
  color,
  spacing,
} from '@repro/design'
import { type Cancel, type FutureInstance, fork } from 'fluture'
import React, { useCallback, useEffect, useRef, useState } from 'react'

export const CREATE_PROJECT = '__create__'

export interface Project {
  id: string
  name: string
}

export type ProjectChoice =
  | { type: 'existing'; projectId: string }
  | { type: 'create'; name: string }
  | null

export function useProjectCatalog(active: boolean) {
  const session = useSession()
  const apiClient = useApiClient()
  const apiClientRef = useRef(apiClient)
  apiClientRef.current = apiClient

  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  const fetchCancelRef = useRef<Cancel | null>(null)

  useEffect(() => {
    if (!active || session === null) {
      setProjectsLoading(false)
      return
    }

    setProjectsLoading(true)
    fetchCancelRef.current = fork(() => {
      setProjectsLoading(false)
      setProjects([])
    })((response: { items: Project[] }) => {
      setProjectsLoading(false)
      setProjects(response.items)
    })(apiClientRef.current.fetch('/projects'))

    return () => fetchCancelRef.current?.()
  }, [active, session, refetchTrigger])

  const createProject = useCallback(
    (name: string): FutureInstance<Error, Project> =>
      apiClientRef.current.fetch<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    []
  )

  const refetchProjects = useCallback(() => {
    setRefetchTrigger(current => current + 1)
  }, [])

  return { projects, projectsLoading, createProject, refetchProjects }
}

interface ProjectSelectionProps {
  ariaLabel: string
  value: ProjectChoice
  onChange(value: ProjectChoice): void
  projects: Project[]
  projectsLoading: boolean
  disabled?: boolean
  creating?: boolean
  error?: string | null
}

export const ProjectSelection: React.FC<ProjectSelectionProps> = ({
  ariaLabel,
  value,
  onChange,
  projects,
  projectsLoading,
  disabled = false,
  creating = false,
  error,
}) => {
  const createMode = value?.type === 'create'
  const showCreateInput =
    createMode || (!projectsLoading && projects.length === 0 && !disabled)

  const handleSelectChange = (projectId: string) => {
    if (projectId === CREATE_PROJECT) {
      onChange({ type: 'create', name: '' })
    } else {
      onChange({ type: 'existing', projectId })
    }
  }

  return (
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
          aria-label={ariaLabel}
        />
      ) : projects.length > 0 ? (
        <Select
          size="small"
          value={
            value?.type === 'existing'
              ? value.projectId
              : createMode
              ? CREATE_PROJECT
              : ''
          }
          onChange={handleSelectChange}
          options={[
            ...projects.map(project => ({
              value: project.id,
              label: project.name,
            })),
            { value: CREATE_PROJECT, label: 'Create new project…' },
          ]}
          placeholder="Select a project…"
          disabled={disabled || creating}
          aria-label={ariaLabel}
        />
      ) : disabled ? (
        <Text variant="caption">Sign in to choose a project</Text>
      ) : null}

      {showCreateInput && (
        <Col gap={spacing.sm}>
          <Input
            size="small"
            value={createMode ? value.name : ''}
            onChange={event =>
              onChange({
                type: 'create',
                name: (event.target as HTMLInputElement).value,
              })
            }
            placeholder="Project name"
            disabled={disabled || creating}
            aria-label={`${ariaLabel} name`}
          />
          {error && (
            <Text variant="caption" color={color.danger}>
              {error}
            </Text>
          )}
        </Col>
      )}
      {!showCreateInput && error && (
        <Text variant="caption" color={color.danger}>
          {error}
        </Text>
      )}
    </FormField>
  )
}
