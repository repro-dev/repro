import { useApiClient } from '@repro/api-client'
import { StaffAccount } from '@repro/domain'
import { useFuture } from '@repro/future-utils'

export interface UseStaffAccountResult {
  account: StaffAccount | null
  isLoading: boolean
  error: Error | null
}

export function useStaffAccount(accountId: string): UseStaffAccountResult {
  const apiClient = useApiClient()

  const result = useFuture<Error, StaffAccount>(
    () => apiClient.fetch<StaffAccount>(`/staff/accounts/${accountId}`),
    [apiClient, accountId]
  )

  if (result.success) {
    return {
      account: result.data,
      isLoading: false,
      error: null,
    }
  }

  return {
    account: null,
    isLoading: result.loading,
    error: result.error,
  }
}
