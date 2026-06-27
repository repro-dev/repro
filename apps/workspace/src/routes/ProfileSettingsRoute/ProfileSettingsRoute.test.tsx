import { ApiProvider, createApiClient } from '@repro/api-client'
import { UserProfile } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProfileSettingsRoute } from './ProfileSettingsRoute'

afterEach(cleanup)

// --- Minimal API client stub ---
const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

// --- Fixtures ---

const verifiedProfile: UserProfile = {
  type: 'user',
  id: 'user-1',
  name: 'John Smith',
  email: 'jsmith@example.com',
  verified: true,
  createdAt: '2024-01-15T00:00:00.000Z',
  account: {
    id: 'account-1',
    name: 'Repro Test',
  },
}

const unverifiedProfile: UserProfile = {
  ...verifiedProfile,
  verified: false,
}

// --- Render helper ---

interface TestProps {
  getProfile?: (_apiClient: typeof apiClient) => any
  updateName?: (_apiClient: typeof apiClient, _name: string) => any
  sendVerification?: (_apiClient: typeof apiClient) => any
}

function renderRoute({
  getProfile = () => resolve(verifiedProfile),
  updateName = () => resolve(undefined),
  sendVerification = () => resolve(undefined),
}: TestProps = {}) {
  return render(
    <ApiProvider client={apiClient}>
      <MemoryRouter initialEntries={['/settings/profile']}>
        <Routes>
          <Route
            path="/settings/profile"
            element={
              <ProfileSettingsRoute
                getProfile={getProfile as any}
                updateName={updateName as any}
                sendVerification={sendVerification as any}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </ApiProvider>
  )
}

// ============================================================================

describe('ProfileSettingsRoute', () => {
  it('shows skeleton placeholders while profile is loading', async () => {
    renderRoute({ getProfile: () => never })
    assert.equal(screen.queryByText('John Smith'), null)
    await waitFor(() => {
      assert.ok(screen.getAllByRole('status').length > 0)
    })
  })

  it('renders profile data after loading', async () => {
    renderRoute()
    await waitFor(() => {
      assert.ok(screen.getByText('John Smith'))
      assert.ok(screen.getByText('jsmith@example.com'))
      assert.ok(screen.getByText('Repro Test'))
      assert.ok(screen.getByText('Verified'))
      assert.ok(
        screen.getByText(
          new Date(verifiedProfile.createdAt).toLocaleDateString()
        )
      )
    })
  })

  it('shows verified badge when user is verified', async () => {
    renderRoute()
    await waitFor(() => {
      assert.ok(screen.getByText('Verified'))
    })
  })

  it('shows unverified badge when user is unverified', async () => {
    renderRoute({ getProfile: () => resolve(unverifiedProfile) })
    await waitFor(() => {
      assert.ok(screen.getByText('Unverified'))
    })
  })

  it('shows resend verification button when unverified', async () => {
    renderRoute({ getProfile: () => resolve(unverifiedProfile) })
    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: /resend verification/i }))
    })
  })

  it('hides resend verification button when verified', async () => {
    renderRoute()
    await waitFor(() => {
      assert.equal(
        screen.queryByRole('button', { name: /resend verification/i }),
        null
      )
    })
  })

  it('calls sendVerification when resend button is clicked', async () => {
    let callCount = 0
    const sendVerification = () => {
      callCount++
      return resolve(undefined)
    }
    renderRoute({
      getProfile: () => resolve(unverifiedProfile),
      sendVerification,
    })
    await waitFor(() =>
      screen.getByRole('button', { name: /resend verification/i })
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /resend verification/i })
      )
    })
    assert.equal(callCount, 1)
  })

  it('enters edit mode when edit button is clicked', async () => {
    renderRoute()
    await waitFor(() => screen.getByRole('button', { name: /edit/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    })
    assert.ok(screen.getByDisplayValue('John Smith'))
    assert.ok(screen.getByRole('button', { name: /save/i }))
    assert.ok(screen.getByRole('button', { name: /cancel/i }))
  })

  it('exits edit mode on cancel without calling updateName', async () => {
    let callCount = 0
    const updateName = (_apiClient: typeof apiClient, _name: string) => {
      callCount++
      return resolve(undefined)
    }
    renderRoute({ updateName })
    await waitFor(() => screen.getByRole('button', { name: /edit/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    })
    assert.equal(callCount, 0)
    assert.equal(screen.queryByRole('button', { name: /save/i }), null)
  })

  it('calls updateName and exits edit mode on save', async () => {
    let updatedName: string | null = null
    const updateName = (_apiClient: typeof apiClient, name: string) => {
      updatedName = name
      return resolve(undefined)
    }
    renderRoute({ updateName })
    await waitFor(() => screen.getByRole('button', { name: /edit/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    })
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('John Smith'), {
        target: { value: 'Jane Doe' },
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
    })
    await waitFor(() => {
      assert.equal(updatedName, 'Jane Doe')
      assert.equal(screen.queryByRole('button', { name: /save/i }), null)
    })
  })

  it('shows error alert when profile fetch fails', async () => {
    renderRoute({ getProfile: () => reject(new Error('Network error')) })
    await waitFor(() => {
      assert.ok(screen.getByText(/failed to load profile/i))
    })
  })

  it('shows error alert when name update fails', async () => {
    const updateName = () => reject(new Error('Update failed'))
    renderRoute({ updateName })
    await waitFor(() => screen.getByRole('button', { name: /edit/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
    })
    await waitFor(() => {
      assert.ok(screen.getByText(/failed to update name/i))
    })
  })

  it('refreshes profile data after a successful name update', async () => {
    let callCount = 0
    const updatedProfile = { ...verifiedProfile, name: 'Jane Doe' }
    const getProfile = () => {
      callCount++
      return callCount === 1
        ? resolve(verifiedProfile)
        : resolve(updatedProfile)
    }
    const updateName = (_apiClient: typeof apiClient, _name: string) =>
      resolve(undefined)

    renderRoute({ getProfile, updateName })
    await waitFor(() => screen.getByText('John Smith'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    })
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('John Smith'), {
        target: { value: 'Jane Doe' },
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
    })
    await waitFor(() => {
      assert.ok(screen.getByText('Jane Doe'))
    })
  })

  it('shows success message after resending verification email', async () => {
    renderRoute({ getProfile: () => resolve(unverifiedProfile) })
    await waitFor(() =>
      screen.getByRole('button', { name: /resend verification/i })
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /resend verification/i })
      )
    })
    await waitFor(() => {
      assert.ok(screen.getByText(/verification email sent/i))
    })
  })
})
