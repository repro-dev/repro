import { ApiProvider, createApiClient } from '@repro/api-client'
import { ConfirmDialogProvider, PortalRootProvider } from '@repro/design'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { map, never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ApiKeysRoute from './index'

afterEach(cleanup)

type ApiKeyRecord = {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

type FetchOptions = {
  method?: string
  body?: string
}

interface RenderOptions {
  listFuture?: any
  createFuture?: any
  revokeFuture?: any
  initialKeys?: ApiKeyRecord[]
}

function renderRoute({
  listFuture,
  createFuture = resolve({
    id: 'api-key-new',
    key: 'rpro_1234567890abcdef1234567890abcd',
    prefix: 'rpro_123',
  }),
  revokeFuture = resolve(undefined),
  initialKeys = [],
}: RenderOptions = {}) {
  const keys = [...initialKeys]
  const baseClient = createApiClient({
    baseUrl: 'http://test',
    authStorage: 'memory',
  })

  const apiClient = {
    ...baseClient,
    fetch: (path: string, options?: FetchOptions) => {
      if (path === '/account/api-keys' && options?.method == null) {
        return listFuture ?? resolve({ items: [...keys] })
      }

      if (path === '/account/api-keys' && options?.method === 'POST') {
        return createFuture.pipe(
          map(result => {
            const typedResult = result as {
              id: string
              key: string
              prefix: string
            }
            const body = JSON.parse(options.body ?? '{}') as { name?: string }

            keys.unshift({
              id: typedResult.id,
              name: body.name ?? 'Unnamed key',
              keyPrefix: typedResult.prefix,
              createdAt: new Date().toISOString(),
              lastUsedAt: null,
              revokedAt: null,
            })

            return typedResult
          })
        )
      }

      if (
        path.startsWith('/account/api-keys/') &&
        options?.method === 'DELETE'
      ) {
        return revokeFuture.pipe(
          map(() => {
            const keyId = path.replace('/account/api-keys/', '')
            const key = keys.find(entry => entry.id === keyId)

            if (key) {
              key.revokedAt = new Date().toISOString()
            }

            return undefined
          })
        )
      }

      return reject(new Error(`Unexpected fetch: ${path}`))
    },
  } as typeof baseClient

  return render(
    <ApiProvider client={apiClient}>
      <PortalRootProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={['/settings/api-keys']}>
            <Routes>
              <Route path="/settings/api-keys" element={<ApiKeysRoute />} />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </PortalRootProvider>
    </ApiProvider>
  )
}

describe('ApiKeysRoute', () => {
  it('shows skeleton placeholders before keys finish loading', () => {
    renderRoute({ listFuture: never })

    assert.equal(screen.queryByRole('button', { name: /new api key/i }), null)
    assert.ok(screen.getAllByRole('status').length > 0)
  })

  it('shows an error state when loading keys fails', async () => {
    renderRoute({ listFuture: reject(new Error('Network error')) })

    await waitFor(() => {
      assert.ok(screen.getByText(/unable to load api keys/i))
    })
  })

  it('renders existing keys with prefix, dates, and status', async () => {
    const createdAt = '2026-04-20T00:00:00.000Z'
    const lastUsedAt = '2026-04-21T00:00:00.000Z'

    renderRoute({
      initialKeys: [
        {
          id: 'key-active',
          name: 'CI pipeline',
          keyPrefix: 'rpro_ab1',
          createdAt,
          lastUsedAt,
          revokedAt: null,
        },
        {
          id: 'key-revoked',
          name: 'Old key',
          keyPrefix: 'rpro_cd2',
          createdAt,
          lastUsedAt: null,
          revokedAt: '2026-04-22T00:00:00.000Z',
        },
      ],
    })

    await waitFor(() => {
      assert.ok(screen.getByText('CI pipeline'))
      assert.ok(screen.getByText('rpro_ab1…'))
      assert.ok(screen.getByText('Active'))
      assert.ok(screen.getByText('Revoked'))
      assert.equal(
        screen.getAllByText(new Date(createdAt).toLocaleDateString()).length,
        2
      )
      assert.ok(screen.getByText(new Date(lastUsedAt).toLocaleDateString()))
    })
  })

  it('creates a key, shows the secret once, and clears it when reopened', async () => {
    renderRoute({
      createFuture: resolve({
        id: 'key-new',
        key: 'rpro_1234567890abcdef1234567890abcd',
        prefix: 'rpro_123',
      }),
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /new api key/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /new api key/i }))
    })

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'CI/CD pipeline' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByDisplayValue('rpro_1234567890abcdef1234567890abcd'))
      assert.ok(screen.getByText(/won.t be able to see it again/i))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /done/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /new api key/i }))
    })

    await waitFor(() => {
      assert.equal(
        screen.queryByDisplayValue('rpro_1234567890abcdef1234567890abcd'),
        null
      )
      assert.equal(
        (screen.getByRole('textbox', { name: /name/i }) as HTMLInputElement)
          .value,
        ''
      )
    })
  })

  it('revokes a key after confirmation and refreshes the list', async () => {
    renderRoute({
      initialKeys: [
        {
          id: 'key-active',
          name: 'CI pipeline',
          keyPrefix: 'rpro_ab1',
          createdAt: '2026-04-20T00:00:00.000Z',
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
      revokeFuture: resolve(undefined),
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /revoke/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('heading', { name: /revoke api key\?/i }))
    })

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: /revoke/i }).at(-1)!
      )
    })

    await waitFor(() => {
      assert.ok(screen.getByText(/revoked/i))
      assert.equal(screen.queryByRole('button', { name: /revoke/i }), null)
    })
  })

  it('shows create errors inline', async () => {
    renderRoute({
      createFuture: reject(new Error('Create failed')),
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /new api key/i }))
    })

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'CI/CD pipeline' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Create failed'))
    })
  })

  it('shows revoke errors inline', async () => {
    renderRoute({
      initialKeys: [
        {
          id: 'key-active',
          name: 'CI pipeline',
          keyPrefix: 'rpro_ab1',
          createdAt: '2026-04-20T00:00:00.000Z',
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
      revokeFuture: reject(new Error('Revoke failed')),
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
    })

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: /revoke/i }).at(-1)!
      )
    })

    await waitFor(() => {
      assert.ok(screen.getByText('Revoke failed'))
    })
  })
})
