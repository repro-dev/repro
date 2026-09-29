import { ApiProvider, createApiClient } from '@repro/api-client'
import { PortalRootProvider } from '@repro/design'
import type { HealthCheckResult, OverallStatus } from '@repro/domain'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { FutureInstance } from 'fluture'
import { never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HealthStatusFooter } from '~/components/HealthStatusFooter'
import { HealthRoute } from '~/routes/HealthRoute'

afterEach(cleanup)

const baseClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

function healthPayload(status: OverallStatus): HealthCheckResult {
  return {
    status,
    timestamp: '2026-09-05T09:30:00.000Z',
    checks: {
      database: { status: 'ok', latencyMs: 4 },
      storage: { status: 'ok', latencyMs: 18 },
    },
  }
}

// One subsystem degraded — the partial-degradation payload from the test plan.
function partialDegradationPayload(): HealthCheckResult {
  return {
    status: 'degraded',
    timestamp: '2026-09-05T09:30:00.000Z',
    checks: {
      database: { status: 'ok', latencyMs: 4 },
      storage: {
        status: 'degraded',
        latencyMs: 1400,
        error: 'S3 latency above threshold',
      },
    },
  }
}

function renderAgreement(
  healthFuture: FutureInstance<unknown, HealthCheckResult>
) {
  const apiClient = {
    ...baseClient,
    fetch: (() => healthFuture) as unknown as typeof baseClient.fetch,
  } as typeof baseClient

  return render(
    <ApiProvider client={apiClient}>
      <PortalRootProvider>
        <MemoryRouter initialEntries={['/health']}>
          <Routes>
            <Route
              path="/health"
              element={
                <>
                  <HealthRoute />
                  <HealthStatusFooter />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </PortalRootProvider>
    </ApiProvider>
  )
}

/**
 * The sidebar chip and the Health page banner must agree: both labels derive
 * from the single `useHealthStatus` hook via `getHealthStatusLabel`.
 */
async function assertAgreement(label: string) {
  await waitFor(() => {
    // Footer chip label
    assert.ok(screen.getByText(label))
    // Page banner label — same source, same label
    assert.ok(screen.getByText(`System status: ${label}`))
  })
}

describe('Health status agreement (chip ↔ page)', () => {
  it('agree on the ok state', async () => {
    renderAgreement(resolve(healthPayload('ok')))

    await assertAgreement('Healthy')
  })

  it('agree on the degraded state', async () => {
    renderAgreement(resolve(healthPayload('degraded')))

    await assertAgreement('Degraded')
  })

  it('agree on the unhealthy state', async () => {
    renderAgreement(resolve(healthPayload('unhealthy')))

    await assertAgreement('Unhealthy')
  })

  it('agree under partial degradation (one subsystem degraded flips both identically)', async () => {
    renderAgreement(resolve(partialDegradationPayload()))

    await assertAgreement('Degraded')

    // The degraded subsystem card renders its error, not a green page
    assert.ok(screen.getByText('S3 latency above threshold'))
  })

  it('render Unhealthy on both surfaces when the hook receives a 503-style payload through the rejected slot', async () => {
    // Hook contract: a rejected fetch whose rejection value IS a
    // HealthCheckResult is used as the health payload (useHealthStatus).
    renderAgreement(reject(healthPayload('unhealthy') as unknown as Error))

    await assertAgreement('Unhealthy')
  })

  it('show the checking state while the health fetch is pending', async () => {
    const { container } = renderAgreement(never)

    await waitFor(() => {
      assert.ok(screen.getByText('Checking…'))
    })

    // Negative: neither surface shows a status label yet
    assert.equal(screen.queryByText(/System status:/), null)
    assert.equal(screen.queryByText('Healthy'), null)

    // The page shows its full-page loading state (spinner), not an error
    assert.ok(container.querySelector('svg'))
  })

  it('show Unhealthy on the chip and the page error state on a hard fetch failure', async () => {
    renderAgreement(reject(new Error('health endpoint unreachable')))

    // Chip label (hook contract: error without a payload ⇒ unhealthy)
    await waitFor(() => {
      assert.ok(screen.getByText('Unhealthy'))
    })

    // Page renders its error state, not a Healthy/Unhealthy banner
    assert.ok(screen.getByText('Health check failed'))
    assert.equal(screen.queryByText(/System status:/), null)
  })
})
