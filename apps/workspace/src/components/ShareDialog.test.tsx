import { ApiProvider, createApiClient } from '@repro/api-client'
import { PortalRootProvider } from '@repro/design'
import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ShareDialog } =
  require('./ShareDialog') as typeof import('./ShareDialog')

const apiClient = createApiClient({
  baseUrl: 'http://localhost:3000',
  authStorage: 'memory',
})

function noop() {}

afterEach(() => {
  cleanup()
})

describe('ShareDialog', () => {
  it('should render privacy warning text when open', () => {
    render(
      <ApiProvider client={apiClient}>
        <PortalRootProvider>
          <ShareDialog
            open={true}
            onClose={noop}
            projectId="proj-1"
            recordingId="rec-1"
          />
        </PortalRootProvider>
      </ApiProvider>
    )

    assert.ok(screen.getByText(/This creates a shareable link/))
  })

  it('should render expiry selector when open', () => {
    render(
      <ApiProvider client={apiClient}>
        <PortalRootProvider>
          <ShareDialog
            open={true}
            onClose={noop}
            projectId="proj-1"
            recordingId="rec-1"
          />
        </PortalRootProvider>
      </ApiProvider>
    )

    assert.ok(screen.getByText('Link expiry'))
  })

  it('should render create share link button', () => {
    render(
      <ApiProvider client={apiClient}>
        <PortalRootProvider>
          <ShareDialog
            open={true}
            onClose={noop}
            projectId="proj-1"
            recordingId="rec-1"
          />
        </PortalRootProvider>
      </ApiProvider>
    )

    assert.ok(screen.getByText('Create share link'))
  })

  it('should render cancel button', () => {
    render(
      <ApiProvider client={apiClient}>
        <PortalRootProvider>
          <ShareDialog
            open={true}
            onClose={noop}
            projectId="proj-1"
            recordingId="rec-1"
          />
        </PortalRootProvider>
      </ApiProvider>
    )

    assert.ok(screen.getByText('Cancel'))
  })

  it('should not render content when closed', () => {
    render(
      <ApiProvider client={apiClient}>
        <PortalRootProvider>
          <ShareDialog
            open={false}
            onClose={noop}
            projectId="proj-1"
            recordingId="rec-1"
          />
        </PortalRootProvider>
      </ApiProvider>
    )

    assert.equal(screen.queryByText('Share recording'), null)
  })
})
