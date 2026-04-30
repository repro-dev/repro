import { cleanup, render, screen, waitFor } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

type Session = { type: 'staff'; isAdmin: boolean } | { type: 'user' } | null

let currentSession: Session = null
let currentSessionLoading = false
let loginPath = '/login'

mock.module('@repro/auth', {
  namedExports: {
    IfSession: ({ children }: React.PropsWithChildren) =>
      currentSessionLoading || !currentSession ? <></> : <>{children}</>,
    useLoginPath: () => loginPath,
    useSession: () => currentSession,
    useSessionLoading: () => currentSessionLoading,
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RequireAdminStaffSession } =
  require('./RequireAdminStaffSession') as typeof import('./RequireAdminStaffSession')

afterEach(() => {
  cleanup()
  currentSession = null
  currentSessionLoading = false
  loginPath = '/login'
})

function renderRoute({
  session = null,
  loading = false,
}: {
  session?: Session
  loading?: boolean
} = {}) {
  currentSession = session
  currentSessionLoading = loading

  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<RequireAdminStaffSession />}>
          <Route index element={<div>Admin staff area</div>} />
        </Route>
        <Route path={loginPath} element={<div>Admin login</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAdminStaffSession', () => {
  it('redirects anonymous users to the configured login path', async () => {
    loginPath = '/admin-login'

    renderRoute()

    await waitFor(() => {
      assert.ok(screen.getByText('Admin login'))
    })

    assert.equal(screen.queryByText('Admin staff area'), null)
  })

  it('redirects non-admin staff to /', async () => {
    renderRoute({ session: { type: 'staff', isAdmin: false } })

    await waitFor(() => {
      assert.ok(screen.getByText('Home'))
    })

    assert.equal(screen.queryByText('Admin staff area'), null)
  })

  it('renders the outlet for admin staff', () => {
    renderRoute({ session: { type: 'staff', isAdmin: true } })

    assert.ok(screen.getByText('Admin staff area'))
    assert.equal(screen.queryByText('Admin login'), null)
  })
})
