import { useApiClient } from '@repro/api-client'
import { ListResponse } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { useCallback } from 'react'

// Minimal project type for the staff account projects list
interface ProjectSummary {
  id: string
  name: string
}

export interface UseStaffAccountProjectsOptions {
  cursor?: string
  limit?: number
}

export interface UseStaffAccountProjectsResult {
  projects: ProjectSummary[]
  nextCursor?: string
  isLoading: boolean
  error: Error | null
}

export function useStaffAccountProjects(
  accountId: string,
  options: UseStaffAccountProjectsOptions = {}
): UseStaffAccountProjectsResult {
  const { cursor, limit = 50 } = options
  const apiClient = useApiClient()

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (limit) params.set('limit', String(limit))
    const query = params.toString()
    return `/staff/accounts/${accountId}/projects${query ? `?${query}` : ''}`
  }, [accountId, cursor, limit])

  const result = useFuture<Error, ListResponse<ProjectSummary>>(
    () => apiClient.fetch<ListResponse<ProjectSummary>>(buildUrl()),
    [apiClient, buildUrl]
  )

  if (result.success) {
    return {
      projects: result.data.items,
      nextCursor: undefined,
      isLoading: false,
      error: null,
    }
  }

  return {
    projects: [],
    isLoading: result.loading,
    error: result.error,
  }
}
