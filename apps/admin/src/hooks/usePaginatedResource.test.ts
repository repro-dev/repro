import { act, renderHook } from '@testing-library/react'
import { never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { usePaginatedResource } from './usePaginatedResource'

describe('usePaginatedResource', () => {
  it('basic fetch resolves and sets displayedData', () => {
    const { result } = renderHook(() =>
      usePaginatedResource({
        fetcher: () => resolve('data-1'),
        deps: [],
      })
    )

    assert.equal(
      result.current.result.success,
      true,
      'should have loaded successfully'
    )
  })

  it('keep-last-data: retains previous value while isRefreshing', async () => {
    let fetchCount = 0

    const { result, rerender } = renderHook(
      (deps: number[]) =>
        usePaginatedResource({
          fetcher: () => {
            fetchCount += 1
            if (fetchCount === 1) return resolve('initial')
            return never
          },
          deps,
        }),
      { initialProps: [1] }
    )

    // Initial data should resolve
    await new Promise(r => setTimeout(r, 10))
    assert.equal(
      result.current.result.success,
      true,
      'first fetch should succeed'
    )
    assert.equal(result.current.displayedData, 'initial')

    // Trigger re-fetch by changing deps
    rerender([2])

    // Wait for loading state
    await new Promise(r => setTimeout(r, 10))

    // While loading, displayedData should still be 'initial'
    assert.equal(
      result.current.displayedData,
      'initial',
      'should keep last data while refreshing'
    )
    assert.equal(
      result.current.isRefreshing,
      true,
      'should be in refreshing state'
    )
  })

  it('isRefreshing is true when loading, no new data, and had last data', async () => {
    let fetchCount = 0

    const { result, rerender } = renderHook(
      (deps: number[]) =>
        usePaginatedResource({
          fetcher: () => {
            fetchCount += 1
            if (fetchCount === 1) return resolve('data')
            return never
          },
          deps,
        }),
      { initialProps: [1] }
    )

    await new Promise(r => setTimeout(r, 10))
    assert.equal(result.current.isRefreshing, false)

    rerender([2])
    await new Promise(r => setTimeout(r, 10))

    assert.equal(result.current.isRefreshing, true)
  })

  it('error with NO prior data: error set, displayedData null', async () => {
    const { result } = renderHook(() =>
      usePaginatedResource({
        fetcher: () => reject(new Error('network error')),
        deps: [],
      })
    )

    await new Promise(r => setTimeout(r, 10))

    assert.equal(result.current.result.loading, false)
    assert.equal(result.current.displayedData, null)
  })

  it('error WITH prior data: retains displayedData', async () => {
    let fetchCount = 0

    const { result, rerender } = renderHook(
      (deps: number[]) =>
        usePaginatedResource({
          fetcher: () => {
            fetchCount += 1
            if (fetchCount === 1) return resolve('prior-data')
            return reject(new Error('fetch failed'))
          },
          deps,
        }),
      { initialProps: [1] }
    )

    await new Promise(r => setTimeout(r, 10))
    assert.equal(result.current.displayedData, 'prior-data')

    // Trigger re-fetch (will fail)
    rerender([2])
    await new Promise(r => setTimeout(r, 10))

    assert.equal(
      result.current.displayedData,
      'prior-data',
      'should keep prior data on error'
    )
  })

  it('retry: incrementing reloadNonce triggers re-fetch', async () => {
    let fetchCount = 0

    const { result } = renderHook(() =>
      usePaginatedResource({
        fetcher: () => {
          fetchCount += 1
          return resolve(`data-${fetchCount}`)
        },
        deps: [],
      })
    )

    // Initial fetch
    await new Promise(r => setTimeout(r, 10))
    assert.equal(fetchCount, 1, 'first fetch')

    // Retry
    await act(async () => {
      result.current.setReloadNonce(n => n + 1)
    })
    await new Promise(r => setTimeout(r, 10))

    assert.equal(fetchCount, 2, 'retry triggered second fetch')
    assert.equal(result.current.displayedData, 'data-2')
  })

  it('refresh progress shows after show-delay on slow fetch', async () => {
    let fetchCount = 0

    const { result, rerender } = renderHook(
      (deps: number[]) =>
        usePaginatedResource({
          fetcher: () => {
            fetchCount += 1
            if (fetchCount === 1) return resolve('data')
            return never
          },
          deps,
        }),
      { initialProps: [1] }
    )

    await new Promise(r => setTimeout(r, 10))
    assert.equal(result.current.showRefreshProgress, false)

    // Trigger slow refetch
    rerender([2])

    // Before show delay
    await new Promise(r => setTimeout(r, 100))
    assert.equal(
      result.current.showRefreshProgress,
      false,
      'should still be hidden before 150ms delay'
    )

    // After show delay
    await new Promise(r => setTimeout(r, 100))
    assert.equal(
      result.current.showRefreshProgress,
      true,
      'should show after 150ms delay'
    )
  })

  it('fast fetch never flashes the progress bar', async () => {
    const { result, rerender } = renderHook(
      (deps: number[]) =>
        usePaginatedResource({
          fetcher: () => resolve('data'),
          deps,
        }),
      { initialProps: [1] }
    )

    await new Promise(r => setTimeout(r, 10))
    assert.equal(result.current.showRefreshProgress, false)

    // Fast refetch
    rerender([2])
    await new Promise(r => setTimeout(r, 200))

    assert.equal(
      result.current.showRefreshProgress,
      false,
      'fast refetch should not show progress'
    )
  })

  it('showRefreshProgress persists on slow refetch that never resolves', async () => {
    let fetchCount = 0

    const { result, rerender } = renderHook(
      (deps: number[]) =>
        usePaginatedResource({
          fetcher: () => {
            fetchCount += 1
            if (fetchCount === 1) return resolve('data')
            return never
          },
          deps,
        }),
      { initialProps: [1] }
    )

    await new Promise(r => setTimeout(r, 10))

    // Trigger slow refetch to show progress
    rerender([2])
    await new Promise(r => setTimeout(r, 300))

    // Progress should be showing, not complete
    assert.equal(result.current.showRefreshProgress, true)
    assert.equal(result.current.completeRefreshProgress, false)
  })

  it('startRefreshProgress resets complete to false', async () => {
    let fetchCount = 0

    const { result, rerender } = renderHook(
      (deps: number[]) =>
        usePaginatedResource({
          fetcher: () => {
            fetchCount += 1
            if (fetchCount === 1) return resolve('data')
            return never
          },
          deps,
        }),
      { initialProps: [1] }
    )

    await new Promise(r => setTimeout(r, 10))

    // Trigger slow refetch to show progress
    rerender([2])
    await new Promise(r => setTimeout(r, 300))

    assert.equal(result.current.showRefreshProgress, true)
    assert.equal(result.current.completeRefreshProgress, false)

    // Force another refresh progress cycle
    result.current.startRefreshProgress()
    assert.equal(result.current.completeRefreshProgress, false)
  })
})
