import { useApiClient } from '@repro/api-client'
import { AccountPlan, PaginatedResponse, StaffAccount } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { useCallback } from 'react'

export interface UseStaffAccountsOptions {
  cursor?: string
  limit?: number
  search?: string
  plan?: AccountPlan
}

export interface UseStaffAccountsResult {
  accounts: StaffAccount[]
  nextCursor?: string
  isLoading: boolean
  error: Error | null
}

export function useStaffAccounts(
  options: UseStaffAccountsOptions = {}
): UseStaffAccountsResult {
  const { cursor, limit = 50, search, plan } = options
  const apiClient = useApiClient()

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (limit) params.set('limit', String(limit))
    if (search) params.set('search', search)
    if (plan) params.set('plan', plan)
    const query = params.toString()
    return `/staff/accounts${query ? `?${query}` : ''}`
  }, [cursor, limit, search, plan])

  const result = useFuture<Error, PaginatedResponse<StaffAccount>>(
    () => apiClient.fetch<PaginatedResponse<StaffAccount>>(buildUrl()),
    [apiClient, buildUrl]
  )

  if (result.success) {
    return {
      accounts: result.data.items,
      nextCursor: result.data.nextCursor,
      isLoading: false,
      error: null,
    }
  }

  return {
    accounts: [],
    isLoading: result.loading,
    error: result.error,
  }
}
