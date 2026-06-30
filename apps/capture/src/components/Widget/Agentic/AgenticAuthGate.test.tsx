import { cleanup, render, screen } from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

let session: unknown = { user: { id: 'user-1' }, email: 'test@test.com' }
let sessionLoading = false

mock.module('@repro/auth', {
  namedExports: {
    useSession: () => session,
    useSessionLoading: () => sessionLoading,
    useAuthContext: () => ({ loadSession: () => resolve(undefined) }),
  },
})

mock.module('./Agentic.hoc', {
  namedExports: {
    Agentic: () => <div>Agentic ready</div>,
  },
})

// Must require() after mock registration so the mocks take effect
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AgenticAuthGate } =
  require('./AgenticAuthGate') as typeof import('./AgenticAuthGate')

describe('AgenticAuthGate', () => {
  afterEach(() => {
    cleanup()
    session = { user: { id: 'user-1' }, email: 'test@test.com' }
    sessionLoading = false
  })

  it('renders Agentic when signed in', () => {
    render(<AgenticAuthGate getSelectedRecording={() => ({}) as any} />)

    assert.ok(screen.getByText('Agentic ready'))
  })
})
