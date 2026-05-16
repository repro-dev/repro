import { ApiClient, useApiClient } from '@repro/api-client'
import { Project } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { getProjects as defaultGetProjects } from '@repro/workspace-api'
import { FutureInstance } from 'fluture'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const STORAGE_KEY = 'repro:selectedProjectId'

interface ProjectContextValue {
  projects: Project[]
  selectedProject: Project | null
  loading: boolean
  selectProject: (projectId: string) => void
  addProject: (project: Project) => void
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  selectedProject: null,
  loading: true,
  selectProject: (_projectId: string) => void 0,
  addProject: (_project: Project) => void 0,
})

export interface ProjectProviderProps extends React.PropsWithChildren {
  // Injectable for testing; defaults to the real workspace-api function.
  getProjects?: (apiClient: ApiClient) => FutureInstance<unknown, Project[]>
}

export function mergeProjects(
  fetchedProjects: Project[],
  localProjects: Project[]
): Project[] {
  const merged = [...fetchedProjects]
  const seen = new Set(fetchedProjects.map(project => project.id))

  for (const project of localProjects) {
    if (seen.has(project.id)) {
      continue
    }

    seen.add(project.id)
    merged.push(project)
  }

  return merged
}

export const ProjectProvider = ({
  children,
  getProjects = defaultGetProjects,
}: ProjectProviderProps) => {
  const apiClient = useApiClient()
  const result = useFuture<unknown, Project[]>(
    () => getProjects(apiClient),
    [apiClient, getProjects]
  )

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  )

  // Projects added locally (e.g. just created) before the next fetch.
  const [localProjects, setLocalProjects] = useState<Project[]>([])

  const fetchedProjects: Project[] = result.success ? result.data : []

  const projects = useMemo(
    () => mergeProjects(fetchedProjects, localProjects),
    [fetchedProjects, localProjects]
  )

  // Resolve the selected project: prefer the persisted ID if it's still valid,
  // otherwise fall back to the first project in the list.
  const selectedProject = useMemo(() => {
    if (projects.length === 0) {
      return null
    }

    if (selectedProjectId) {
      const match = projects.find(project => project.id === selectedProjectId)
      if (match) {
        return match
      }
    }

    // Persisted ID is no longer valid — fall back to first project.
    return projects[0] ?? null
  }, [projects, selectedProjectId])

  // Keep localStorage in sync whenever the effective selection changes.
  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem(STORAGE_KEY, selectedProject.id)
    }
  }, [selectedProject])

  const selectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    localStorage.setItem(STORAGE_KEY, projectId)
  }, [])

  const addProject = useCallback((project: Project) => {
    setLocalProjects(prev => {
      // Deduplicate: skip if this id is already present.
      if (prev.some(existingProject => existingProject.id === project.id)) {
        return prev
      }
      return [...prev, project]
    })
    setSelectedProjectId(project.id)
    localStorage.setItem(STORAGE_KEY, project.id)
  }, [])

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      selectedProject,
      loading: result.loading,
      selectProject,
      addProject,
    }),
    [projects, selectedProject, result.loading, selectProject, addProject]
  )

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  )
}

export function useProjectContext(): ProjectContextValue {
  return useContext(ProjectContext)
}
