import * as AuthModule from '@repro/auth'
import { PortalRootProvider as DesignPortalRootProvider } from '@repro/design'
import * as DevToolsModule from '@repro/devtools'
import { PlaybackProvider } from '@repro/playback'
import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it, mock } from 'node:test'
import React from 'react'

const noop = () => {}

/**
 * jsdom's postMessage throws SyntaxError when receiving invalid target
 * origins. Various animation libraries use postMessage internally for
 * frame scheduling. We shim it to a no-op so renders don't crash.
 */
const originalPostMessage = window.postMessage.bind(window)
window.postMessage = () => {}

// Polyfill ResizeObserver and scrollTo for jsdom — used by agentic-ui hooks
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const ResizeObserverPolyfill =
  ResizeObserverStub as unknown as typeof ResizeObserver
window.ResizeObserver = ResizeObserverPolyfill
globalThis.ResizeObserver = ResizeObserverPolyfill

if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = noop as typeof Element.prototype.scrollTo
}

/**
 * Minimal mock session object.
 * A null return from useSession means unauthenticated.
 */
const mockSession = { id: 'test-session' }

/**
 * Playback stub matching the minimum surface consumed by the
 * CaptureModal subtree. Provided to usePlayback via PlaybackProvider.
 */
function createPlaybackStub() {
  return {
    getSourceEvents: () => ({ toSource: () => [] }),
    getDuration: () => 60000,
    getBuffer: () => ({ toSource: () => [] }),
    getSnapshot: () => ({}),
    getResourceMap: () => ({}),
    copy: () => createPlaybackStub(),
    getActiveIndex: () => 0,
    getElapsed: () => 0,
    getEventIndexAtTime: () => 0,
    getEventTimeAtIndex: () => 0,
    getEventTypeAtIndex: () => null,
    getLatestControlFrame: () => 0,
    getLatestEventTime: () => 0,
    getPlaybackState: () => 0,
    getActiveBreakpoint: () => null,
    getBreakpoints: () => [],
    getBreakpointsEnabled: () => false,
    getSpeed: () => 1,
    open: noop,
    close: noop,
    seekToEvent: noop,
    seekToTime: noop,
  }
}

// Controlled session variable that tests can mutate
let currentSession: typeof mockSession | null = mockSession

/**
 * Mock @repro/auth passing through all real exports but overriding
 * hooks that need AuthProvider context. useSession is controlled so
 * tests can toggle authentication state.
 */
mock.module('@repro/auth', {
  namedExports: {
    ...AuthModule,
    useSession: () => currentSession,
    useSessionLoading: () => false,
    useAuthContext: () => ({
      $session: { getValue: () => currentSession },
      $sessionLoading: { getValue: () => false },
      loginPath: '/login',
      login: noop,
      logout: noop,
      loadSession: noop,
      resetPassword: noop,
      confirmPasswordReset: noop,
      register: noop,
      acceptInvitation: noop,
    }),
  },
})

/**
 * Mock @repro/devtools passing through all real exports but overriding
 * DevTools to render null, avoiding deep dependency failures in the
 * CaptureReview subtree.
 */
mock.module('@repro/devtools', {
  namedExports: {
    ...DevToolsModule,
    DevTools: () => null,
  },
})

mock.module('~/state', {
  namedExports: {
    useRecordingMode: () => [1, noop],
  },
})

// Must require() after mock registration so the mocks take effect
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureModal } =
  require('./CaptureModal') as typeof import('./CaptureModal')

const testPlayback = createPlaybackStub() as any

describe('CaptureModal', () => {
  afterEach(() => {
    cleanup()
    // Reset session to default
    currentSession = mockSession
  })

  after(() => {
    window.postMessage = originalPostMessage
  })

  function renderModal(projectId: string | null) {
    return render(
      <DesignPortalRootProvider>
        <PlaybackProvider playback={testPlayback}>
          <CaptureModal open={true} projectId={projectId} onClose={noop} />
        </PlaybackProvider>
      </DesignPortalRootProvider>
    )
  }

  it('renders download button regardless of save state', () => {
    renderModal('proj-1')

    const downloadButton = screen.getByText('Download locally')
    assert.ok(downloadButton, 'Download tooltip should be rendered')
  })

  it('renders save tooltip describing normal save availability when projectId and session are available', () => {
    currentSession = mockSession
    renderModal('proj-1')

    const tooltip = screen.getByText('Save recording to project')
    assert.ok(
      tooltip,
      'Tooltip should say "Save recording to project" when signed in and project exists'
    )
  })

  it('renders auth-prompt tooltip when session is null (not signed in)', () => {
    currentSession = null
    renderModal('proj-1')

    const tooltip = screen.getByText('Sign in to Repro to upload recordings')
    assert.ok(tooltip, 'Tooltip should prompt sign-in when session is null')
  })

  it('renders project-prompt tooltip when signed in but no project', () => {
    currentSession = mockSession
    renderModal(null)

    const tooltip = screen.getByText(
      'Select or create a project to upload. You can still download locally.'
    )
    assert.ok(
      tooltip,
      'Tooltip should prompt project selection when projectId is null'
    )
  })
})
