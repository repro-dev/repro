import { useApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import { BillingEntitlement, ListResponse } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { resolve } from 'fluture'

export function useEntitlements() {
  const apiClient = useApiClient()
  const session = useSession()

  const { loading, error, data } = useFuture<
    Error,
    ListResponse<BillingEntitlement>
  >(
    () =>
      session
        ? apiClient.fetch<ListResponse<BillingEntitlement>>(
            '/billing/entitlements'
          )
        : resolve({ items: [] as Array<BillingEntitlement> }),
    [apiClient, session]
  )
  return { loading, error, entitlements: data?.items ?? [] }
}
