import { ApiProvider, createApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { PortalRootProvider } from '@repro/design'
import { User } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../../../../../packages/auth/src/AuthProvider'
import { createState } from '../../../../../packages/auth/src/createState'
import {
  RecordingPrivacySettingsRoute,
  RecordingPrivacySettingsRouteConnected,
} from './RecordingPrivacySettingsRoute'

afterEach(cleanup)

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const adminUser: User = {
  type: 'user',
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@example.com',
  verified: true,
  admin: true,
}

const nonAdminUser: User = {
  ...adminUser,
  admin: false,
}

interface TestProps {
  getPreset?: (_apiClient: typeof apiClient) => any
  updatePreset?: (_apiClient: typeof apiClient, _preset: string) => any
}

function renderRoute({
  getPreset = () => resolve({ value: 'standard' }),
  updatePreset = () => resolve(undefined),
}: TestProps = {}) {
  return render(
    <ApiProvider client={apiClient}>
      <PortalRootProvider>
        <MemoryRouter initialEntries={['/settings/privacy-controls']}>
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
            <Route
              path="/settings/privacy-controls"
              element={
                <RecordingPrivacySettingsRoute
                  getPreset={getPreset as any}
                  updatePreset={updatePreset as any}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </PortalRootProvider>
    </ApiProvider>
  )
}

function renderConnectedRoute(session: User | null) {
  const state = createState({ apiClient })
  const [$session] = createAtom(session)
  const [$sessionLoading] = createAtom(false)

  return render(
    <AuthContext.Provider
      value={{
        ...state,
        $session: $session as typeof state.$session,
        $sessionLoading,
      }}
    >
      <ApiProvider client={apiClient}>
        <PortalRootProvider>
          <MemoryRouter initialEntries={['/settings/privacy-controls']}>
            <Routes>
              <Route
                path="/settings/profile"
                element={<div>Profile settings</div>}
              />
              <Route
                path="/settings/*"
                element={<RecordingPrivacySettingsRouteConnected />}
              />
            </Routes>
          </MemoryRouter>
        </PortalRootProvider>
      </ApiProvider>
    </AuthContext.Provider>
  )
}

describe('RecordingPrivacySettingsRoute', () => {
  it('renders the page title and preset options after loading', async () => {
    renderRoute()

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', {
          name: 'Privacy Controls',
          level: 1,
        })
      )
    })

    // Check preset section heading
    assert.ok(
      screen.getByRole('heading', {
        name: 'Default Privacy Preset',
        level: 2,
      })
    )

    // Check preset names are displayed
    for (const name of ['Strict', 'Standard', 'Off']) {
      assert.ok(screen.getByText(name))
    }

    // Standard should be selected by default
    assert.ok(screen.getByRole('button', { name: /save changes/i }))
    assert.equal(
      screen
        .getByRole('button', { name: /save changes/i })
        .hasAttribute('disabled'),
      true
    )
  })

  it('enables save when preset changes', async () => {
    renderRoute({
      getPreset: () => resolve({ value: 'standard' }),
    })

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', {
          name: 'Privacy Controls',
          level: 1,
        })
      )
    })

    // Save should be disabled initially (no changes)
    assert.equal(
      screen
        .getByRole('button', { name: /save changes/i })
        .hasAttribute('disabled'),
      true
    )

    // Click the Strict preset radio
    const strictRadio = screen.getByRole('radio', { name: /^Strict / })
    assert.ok(strictRadio)

    await act(async () => {
      fireEvent.click(strictRadio)
    })

    // Save should now be enabled
    assert.equal(
      screen
        .getByRole('button', { name: /save changes/i })
        .hasAttribute('disabled'),
      false
    )
  })

  it('shows cancel button when preset changes and restores on cancel', async () => {
    renderRoute({
      getPreset: () => resolve({ value: 'standard' }),
    })

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', {
          name: 'Privacy Controls',
          level: 1,
        })
      )
    })

    // Click the Strict preset radio
    const strictRadio = screen.getByRole('radio', { name: /^Strict / })
    assert.ok(strictRadio)

    await act(async () => {
      fireEvent.click(strictRadio)
    })

    // Cancel button should appear
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    assert.ok(cancelButton)

    // Click cancel
    await act(async () => {
      fireEvent.click(cancelButton)
    })

    // Save should be disabled again
    assert.equal(
      screen
        .getByRole('button', { name: /save changes/i })
        .hasAttribute('disabled'),
      true
    )
  })

  it.skip('calls updatePreset on save and refreshes', async () => {
    const updateCalls: string[] = []
    let loadCount = 0
    const getPreset = () => {
      loadCount++
      return resolve({ value: loadCount === 1 ? 'standard' : 'strict' })
    }
    const updatePreset = (_apiClient: typeof apiClient, preset: string) => {
      updateCalls.push(preset)
      return resolve(undefined)
    }

    renderRoute({ getPreset, updatePreset } as any)

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', {
          name: 'Privacy Controls',
          level: 1,
        })
      )
    })

    // Click the Strict preset radio
    const strictRadio = screen.getByRole('radio', { name: /^Strict / })
    assert.ok(strictRadio)

    await act(async () => {
      fireEvent.click(strictRadio)
    })

    // Click save
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    })

    await waitFor(() => {
      assert.equal(updateCalls.length, 1)
      assert.equal(updateCalls[0], 'strict')
    })

    // After save, should refresh data
    await waitFor(() => {
      assert.equal(loadCount, 2)
    })
  })

  it('shows error alert when loading fails', async () => {
    renderRoute({
      getPreset: () => reject(new Error('Network error')),
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('alert'))
    })

    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /failed to load recording privacy settings/i
    )
  })

  it('shows error alert when saving fails', async () => {
    renderRoute({
      updatePreset: () => reject(new Error('Update failed')),
    })

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', {
          name: 'Privacy Controls',
          level: 1,
        })
      )
    })

    // Click the Strict preset radio
    const strictRadio = screen.getByRole('radio', { name: /^Strict / })
    assert.ok(strictRadio)

    await act(async () => {
      fireEvent.click(strictRadio)
    })

    // Click save
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    })

    await waitFor(() => {
      assert.ok(screen.getByRole('alert'))
    })

    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /failed to save the privacy setting/i
    )
  })

  it('renders documentation section with selector details', async () => {
    renderRoute()

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', {
          name: 'Privacy Controls',
          level: 1,
        })
      )
    })

    // Check documentation section heading
    assert.ok(
      screen.getByRole('heading', {
        name: 'Selector-based Overrides',
        level: 2,
      })
    )

    // Check selector documentation content (appears in both label and inline code)
    assert.ok(screen.getAllByText('.repro-ignore').length >= 2)
    assert.ok(screen.getAllByText('.repro-mask').length >= 2)
  })

  it('does not contain stale .repro-mask "planned but not yet active" text', async () => {
    renderRoute()

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', {
          name: 'Privacy Controls',
          level: 1,
        })
      )
    })

    // The stale text should not appear
    assert.equal(screen.queryByText(/planned but not yet active/i), null)
  })

  it('contains accurate preset descriptions for each preset', async () => {
    renderRoute()

    await waitFor(() => {
      assert.ok(
        screen.getByRole('heading', {
          name: 'Privacy Controls',
          level: 1,
        })
      )
    })

    // Strict mentions input elements and contenteditable
    assert.ok(screen.getByText(/masks all input elements/i))

    // Standard mentions .repro-mask and .repro-ignore (both appear in
    // radio descriptions and the documentation section, so use getAllByText)
    assert.ok(screen.getAllByText(/\.repro-ignore/i).length >= 2)
    assert.ok(screen.getAllByText(/\.repro-mask/i).length >= 2)

    // Off mentions the credential floor
    assert.ok(screen.getByText(/authentication headers/i))
  })

  it('redirects non-admin users to profile settings', async () => {
    renderConnectedRoute(nonAdminUser)

    await waitFor(() => {
      assert.ok(screen.getByText('Profile settings'))
    })
  })
})
