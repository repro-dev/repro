import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { render, waitFor } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { AuthContext } from '../../../packages/auth/src/AuthProvider'
import { useRecordingPrivacyPreset } from './useRecordingPrivacyPreset'

// Test component that exposes hook state
function TestComponent({
  onResult,
}: {
  onResult: (result: ReturnType<typeof useRecordingPrivacyPreset>) => void
}) {
  const result = useRecordingPrivacyPreset()
  // Report result synchronously on each render
  React.useEffect(() => {
    onResult(result)
  }, [result, onResult])
  return null
}

describe('useRecordingPrivacyPreset', () => {
  afterEach(() => {
    // Cleanup is handled by testing-library
  })

  it('returns standard override with loading=false when no session', async () => {
    const results: Array<ReturnType<typeof useRecordingPrivacyPreset>> = []

    const apiClient = createApiClient({
      baseUrl: 'http://test',
      authStorage: 'memory',
    })

    const [$session] = createAtom<null>(null)
    const [$sessionLoading] = createAtom(false)

    render(
      <ApiProvider client={apiClient}>
        <AuthContext.Provider
          value={
            {
              $session,
              $sessionLoading,
              session: null,
              loading: false,
              error: null,
            } as any
          }
        >
          <TestComponent
            onResult={r => {
              results.push(r)
            }}
          />
        </AuthContext.Provider>
      </ApiProvider>
    )

    await waitFor(() => {
      assert.equal(results.length > 0, true)
    })

    const last = results[results.length - 1]!
    assert.equal(last.loading, false)
    assert.deepStrictEqual(last.override.maskedSelectors, ['.repro-mask'])
    assert.equal(last.override.maskImages, false)
  })

  it('returns standard override when session exists (fetch will fail but fallback works)', async () => {
    const results: Array<ReturnType<typeof useRecordingPrivacyPreset>> = []

    const apiClient = createApiClient({
      baseUrl: 'http://test',
      authStorage: 'memory',
    })

    const userSession = {
      type: 'user' as const,
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      verified: true,
      admin: false,
    }

    const [$session] = createAtom(userSession)
    const [$sessionLoading] = createAtom(false)

    render(
      <ApiProvider client={apiClient}>
        <AuthContext.Provider
          value={
            {
              $session,
              $sessionLoading,
              session: userSession,
              loading: false,
              error: null,
            } as any
          }
        >
          <TestComponent
            onResult={r => {
              results.push(r)
            }}
          />
        </AuthContext.Provider>
      </ApiProvider>
    )

    // Wait for loading to settle (fetch will fail against test server, fallback to standard)
    await waitFor(() => {
      const last = results[results.length - 1]
      return last != null && !last.loading
    })

    const last = results[results.length - 1]!
    // Should fall back to standard
    assert.deepStrictEqual(last.override.maskedSelectors, ['.repro-mask'])
    assert.equal(last.override.maskImages, false)
  })

  it('returns a RedactionOverride with all required fields when no session', async () => {
    const results: Array<ReturnType<typeof useRecordingPrivacyPreset>> = []

    const apiClient = createApiClient({
      baseUrl: 'http://test',
      authStorage: 'memory',
    })

    const [$session] = createAtom<null>(null)
    const [$sessionLoading] = createAtom(false)

    render(
      <ApiProvider client={apiClient}>
        <AuthContext.Provider
          value={
            {
              $session,
              $sessionLoading,
              session: null,
              loading: false,
              error: null,
            } as any
          }
        >
          <TestComponent
            onResult={r => {
              results.push(r)
            }}
          />
        </AuthContext.Provider>
      </ApiProvider>
    )

    await waitFor(() => {
      assert.equal(results.length > 0, true)
    })

    const last = results[results.length - 1]!
    // Verify full RedactionOverride shape
    assert.ok(Array.isArray(last.override.maskedSelectors))
    assert.equal(typeof last.override.maskImages, 'boolean')
    assert.ok(
      last.override.redaction === undefined ||
        (typeof last.override.redaction === 'object' &&
          last.override.redaction !== null)
    )
  })
})
