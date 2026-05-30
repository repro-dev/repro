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

  it('renders a project-required prompt when signed in without a project', () => {
    render(
      <AgenticAuthGate
        getSelectedRecording={() => ({}) as any}
        hasProjectId={false}
      />
    )

    assert.ok(screen.getByText('Choose a workspace project'))
    assert.ok(
      screen.getByText(
        'Saving a recording requires a workspace project. You can still use agentic debugging, review playback, or download locally.'
      )
    )
    assert.equal(screen.queryByText('Agentic ready'), null)
  })

  it('renders Agentic when signed in with a project', () => {
    render(
      <AgenticAuthGate
        getSelectedRecording={() => ({}) as any}
        hasProjectId={true}
      />
    )

    assert.ok(screen.getByText('Agentic ready'))
  })
})
