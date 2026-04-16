import { useApiClient } from '@repro/api-client'
import { ListResponse, StaffUserDetail } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { useCallback } from 'react'

export interface UseStaffAccountUsersOptions {
  cursor?: string
  limit?: number
}

export interface UseStaffAccountUsersResult {
  users: StaffUserDetail[]
  nextCursor?: string
  isLoading: boolean
  error: Error | null
}

export function useStaffAccountUsers(
  accountId: string,
  options: UseStaffAccountUsersOptions = {}
): UseStaffAccountUsersResult {
  const { cursor, limit = 50 } = options
  const apiClient = useApiClient()

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (limit) params.set('limit', String(limit))
    const query = params.toString()
    return `/staff/accounts/${accountId}/users${query ? `?${query}` : ''}`
  }, [accountId, cursor, limit])

  const result = useFuture<Error, ListResponse<StaffUserDetail>>(
    () => apiClient.fetch<ListResponse<StaffUserDetail>>(buildUrl()),
    [apiClient, buildUrl]
  )

  if (result.success) {
    return {
      users: result.data.items,
      nextCursor: undefined,
      isLoading: false,
      error: null,
    }
  }

  return {
    users: [],
    isLoading: result.loading,
    error: result.error,
  }
}
