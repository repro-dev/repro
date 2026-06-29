import { useApiClient, type ApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import { RecordingPrivacyPreset } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { RedactionOverride, toRedactionOverrides } from '@repro/recording'
import { resolve } from 'fluture'
import { useMemo } from 'react'

// Intentional fork of getRecordingPrivacyPreset in @repro/workspace-api
// (packages/workspace-api/src/queries.ts:146). Capture runs in page-world
// context and cannot depend on workspace-api (page-world transport separation).
function getRecordingPrivacyPreset(apiClient: ApiClient) {
  return apiClient.fetch<{ value: RecordingPrivacyPreset }>('/account/privacy')
}

/**
 * Resolves the account's recording privacy preset to a RedactionOverride.
 *
 * Fetches GET /account/privacy and maps the preset to redaction/masking config.
 * Falls back to `standard` on ANY error (unauthenticated, network failure,
 * unexpected response). Never falls back to `off`.
 */
export function useRecordingPrivacyPreset(): {
  override: RedactionOverride
  loading: boolean
  error: Error | undefined
} {
  const apiClient = useApiClient()
  const session = useSession()

  const { loading, data, error } = useFuture(() => {
    if (!session) {
      // Unauthenticated: resolve a noop Future with standard preset,
      // avoiding a doomed fetch that will 401.
      return resolve<{ value: RecordingPrivacyPreset }>({
        value: 'standard',
      })
    }
    return getRecordingPrivacyPreset(apiClient)
  }, [apiClient, session])

  return useMemo(() => {
    // Fail-safe: standard on any error/missing data (never off)
    const preset: RecordingPrivacyPreset = data?.value ?? 'standard'

    return {
      override: toRedactionOverrides(preset),
      loading,
      error: error as Error | undefined,
    }
  }, [data, loading, error])
}
