import { cleanup, render, screen, waitFor } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

type Session = { id: string } | null

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
const { RequireAdminSession } =
  require('./RequireAdminSession') as typeof import('./RequireAdminSession')

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
        <Route path="/admin" element={<RequireAdminSession />}>
          <Route index element={<div>Admin area</div>} />
        </Route>
        <Route path={loginPath} element={<div>Admin login</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAdminSession', () => {
  it('redirects anonymous visitors to the configured login path after mount', async () => {
    loginPath = '/admin-login'

    renderRoute()

    await waitFor(() => {
      assert.ok(screen.getByText('Admin login'))
    })

    assert.equal(screen.queryByText('Admin area'), null)
  })
})
