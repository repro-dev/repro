import { useFuture } from '@repro/future-utils'
import type { FutureInstance } from 'fluture'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

const REFRESH_PROGRESS_SHOW_DELAY_MS = 150
const REFRESH_PROGRESS_HIDE_DELAY_MS = 220

/**
 * Shared hook for listing-page data fetching with keep-last-data,
 * refresh-progress timing, and retry.
 *
 * ## Strategy decision (guardrail #6 from REP-1505)
 *
 * This hook is **strategy-agnostic** — it owns the shared refresh-progress
 * timing state machine, keep-last-data (`displayedData`), and retry
 * machinery (`setReloadNonce`), while each consumer keeps its own pagination
 * state (cursor-stack, offset+limit+1 sentinel, client-slice).
 *
 * Rationale: the three admin routes have fundamentally different pagination
 * mechanisms that would leak complexity into a shared adapter interface.
 * The hook's value is eliminating the duplicated refresh-progress timing
 * and keep-last-data pattern, NOT abstracting pagination.
 *
 * Supports all three strategies required by the acceptance criteria:
 * - **Cursor** — consumer manages cursorStack; `deps` includes cursor
 * - **Offset-sentinel** — consumer manages page+offset; `deps` includes path with offset+limit+1
 * - **Client-slice** — consumer fetches all data and slices client-side; `deps` is static
 *
 * Exposes `setReloadNonce` for retry actions (calling it with `n => n + 1`
 * triggers a fresh fetch).
 */
export function usePaginatedResource<T, E = Error>({
  fetcher,
  deps,
}: {
  fetcher: () => FutureInstance<E, T>
  deps: React.DependencyList
}) {
  const [reloadNonce, setReloadNonce] = useState(0)
  const result = useFuture<E, T>(fetcher, [...deps, reloadNonce] as unknown[])

  const [lastSuccessfulResponse, setLastSuccessfulResponse] =
    useState<T | null>(null)
  const [showRefreshProgress, setShowRefreshProgress] = useState(false)
  const [completeRefreshProgress, setCompleteRefreshProgress] = useState(false)
  const showRefreshProgressRef = useRef(false)

  useEffect(() => {
    showRefreshProgressRef.current = showRefreshProgress
  }, [showRefreshProgress])

  useEffect(() => {
    if (result.data != null) {
      setLastSuccessfulResponse(result.data)
    }
  }, [result.data])

  // `displayedData` keeps the last successful data visible while a
  // background refresh is in-flight. Cast is safe because when both
  // `result.data` and `lastSuccessfulResponse` are null, the value is
  // still null — the type system just can't narrow the generic.
  const displayedData = (result.data ?? lastSuccessfulResponse) as T | null
  const isRefreshing =
    result.loading && result.data == null && lastSuccessfulResponse != null

  useEffect(() => {
    if (isRefreshing) {
      setCompleteRefreshProgress(false)

      if (showRefreshProgressRef.current) return

      const showTimeout = window.setTimeout(() => {
        setShowRefreshProgress(true)
      }, REFRESH_PROGRESS_SHOW_DELAY_MS)

      return () => window.clearTimeout(showTimeout)
    }

    if (!showRefreshProgress) return

    setCompleteRefreshProgress(true)
    const hideTimeout = window.setTimeout(() => {
      setShowRefreshProgress(false)
      setCompleteRefreshProgress(false)
    }, REFRESH_PROGRESS_HIDE_DELAY_MS)

    return () => window.clearTimeout(hideTimeout)
  }, [isRefreshing, showRefreshProgress])

  const startRefreshProgress = useCallback(() => {
    if (lastSuccessfulResponse == null) return

    if (showRefreshProgressRef.current) {
      setCompleteRefreshProgress(false)
    }
  }, [lastSuccessfulResponse])

  return {
    result,
    displayedData,
    isRefreshing,
    showRefreshProgress,
    completeRefreshProgress,
    startRefreshProgress,
    setReloadNonce,
  }
}
