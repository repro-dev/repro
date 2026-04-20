import { ApiProvider, createApiClient } from '@repro/api-client'
import { ConfirmDialogProvider } from '@repro/design'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SettingsRoute from './SettingsRoute'

afterEach(cleanup)

const baseClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const apiClient = {
  ...baseClient,
  fetch: (() => resolve({ items: [] })) as any,
} as typeof baseClient

function renderSettingsRoute() {
  return render(
    <ApiProvider client={apiClient}>
      <ConfirmDialogProvider>
        <MemoryRouter initialEntries={['/settings/api-keys']}>
          <Routes>
            <Route path="/settings/*" element={<SettingsRoute />} />
          </Routes>
        </MemoryRouter>
      </ConfirmDialogProvider>
    </ApiProvider>
  )
}

describe('SettingsRoute', () => {
  it('renders the real API keys management screen at /settings/api-keys', async () => {
    renderSettingsRoute()

    await waitFor(() => {
      assert.ok(
        screen.getByRole('button', { name: /new api key/i }),
        'expected the API keys management screen, not the placeholder page'
      )
    })
  })
})
