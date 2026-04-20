import { useApiClient } from '@repro/api-client'
import type { HealthCheckResult } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { useCallback, useEffect, useState } from 'react'

export function getHealthStatusLabel(status: HealthCheckResult['status']) {
  return status === 'ok'
    ? 'Healthy'
    : status === 'degraded'
    ? 'Degraded'
    : 'Unhealthy'
}

function isHealthCheckResult(value: unknown): value is HealthCheckResult {
  if (value == null || typeof value !== 'object') {
    return false
  }

  const result = value as {
    status?: unknown
    timestamp?: unknown
    checks?: unknown
  }

  return (
    typeof result.status === 'string' &&
    typeof result.timestamp === 'string' &&
    result.checks != null &&
    typeof result.checks === 'object'
  )
}

export function useHealthStatus() {
  const apiClient = useApiClient()
  const [refreshKey, setRefreshKey] = useState(0)

  const result = useFuture(
    () => apiClient.fetch('/health'),
    [apiClient, refreshKey]
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(key => key + 1)
    }, 30_000)

    return () => clearInterval(interval)
  }, [])

  const refresh = useCallback(() => {
    setRefreshKey(key => key + 1)
  }, [])

  const healthResult = isHealthCheckResult(result.error)
    ? result.error
    : isHealthCheckResult(result.data)
    ? result.data
    : null

  const status =
    healthResult?.status ?? (result.error != null ? 'unhealthy' : null)

  return {
    ...result,
    healthResult,
    status,
    refresh,
  }
}
