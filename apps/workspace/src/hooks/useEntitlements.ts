import { useApiClient } from '@repro/api-client'
import { BillingEntitlement, ListResponse } from '@repro/domain'
import { useFuture } from '@repro/future-utils'

export function useEntitlements() {
  const apiClient = useApiClient()
  const { loading, error, data } = useFuture<
    Error,
    ListResponse<BillingEntitlement>
  >(
    () =>
      apiClient.fetch<ListResponse<BillingEntitlement>>(
        '/billing/entitlements'
      ),
    [apiClient]
  )
  return { loading, error, entitlements: data?.items ?? [] }
}
