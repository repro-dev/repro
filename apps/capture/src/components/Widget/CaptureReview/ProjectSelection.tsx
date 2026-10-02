import { Col } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import {
  Alert,
  Button,
  FormField,
  Input,
  Label,
  Select,
  Text,
  color,
  spacing,
} from '@repro/design'
import { type FutureInstance, fork, map } from 'fluture'
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

interface ProjectCatalogState {
  principalId: string
  projects: Project[]
  loading: boolean
  error: boolean
}

export function useProjectCatalog(active: boolean) {
  const session = useSession()
  const apiClient = useApiClient()
  const apiClientRef = useRef(apiClient)
  apiClientRef.current = apiClient
  const principalId = active && session !== null ? session.id : null

  const [catalog, setCatalog] = useState<ProjectCatalogState | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  const fetchGenerationRef = useRef(0)
  const invalidateFetchGeneration = useCallback((generation: number) => {
    if (generation === fetchGenerationRef.current) {
      fetchGenerationRef.current++
    }
  }, [])

  useEffect(() => {
    const generation = ++fetchGenerationRef.current
    if (principalId === null) {
      return
    }

    setCatalog(current =>
      current?.principalId === principalId
        ? { ...current, loading: true, error: false }
        : { principalId, projects: [], loading: true, error: false }
    )
    const cancel = fork(() => {
      if (generation !== fetchGenerationRef.current) return
      setCatalog(current =>
        current?.principalId === principalId
          ? { ...current, loading: false, error: true }
          : current
      )
    })((response: { items: Project[] }) => {
      if (generation !== fetchGenerationRef.current) return
      setCatalog({
        principalId,
        projects: response.items,
        loading: false,
        error: false,
      })
    })(apiClientRef.current.fetch('/projects'))

    return () => {
      invalidateFetchGeneration(generation)
      cancel()
    }
  }, [invalidateFetchGeneration, principalId, refetchTrigger, session])

  const createProject = useCallback(
    (name: string): FutureInstance<Error, Project> =>
      apiClientRef.current
        .fetch<Project>('/projects', {
          method: 'POST',
          body: JSON.stringify({ name }),
        })
        .pipe(
          map(project => {
            if (project.id && principalId !== null) {
              setCatalog(current =>
                current?.principalId === principalId &&
                !current.projects.some(existing => existing.id === project.id)
                  ? { ...current, projects: [...current.projects, project] }
                  : current
              )
            }
            return project
          })
        ),
    [principalId]
  )

  const refetchProjects = useCallback(() => {
    setRefetchTrigger(current => current + 1)
  }, [])

  const visibleCatalog =
    principalId !== null && catalog?.principalId === principalId
      ? catalog
      : null

  return {
    projects: visibleCatalog?.projects ?? [],
    projectsLoading:
      principalId !== null &&
      (visibleCatalog === null || visibleCatalog.loading),
    projectsError: visibleCatalog?.error ?? false,
    createProject,
    refetchProjects,
  }
}

interface ProjectSelectionProps {
  ariaLabel: string
  value: ProjectChoice
  onChange(value: ProjectChoice): void
  projects: Project[]
  projectsLoading: boolean
  projectsError: boolean
  onRetry(): void
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
  projectsError,
  onRetry,
  disabled = false,
  creating = false,
  error,
}) => {
  const createMode = value?.type === 'create'
  const showCreateInput =
    !projectsError &&
    (createMode || (!projectsLoading && projects.length === 0 && !disabled))

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

      {projectsError && (
        <Col gap={spacing.sm}>
          <Alert type="danger">
            Projects could not be loaded. Check your connection and try again.
          </Alert>
          <Button
            variant="outlined"
            size="small"
            disabled={disabled || projectsLoading}
            onClick={onRetry}
          >
            Retry
          </Button>
        </Col>
      )}

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
