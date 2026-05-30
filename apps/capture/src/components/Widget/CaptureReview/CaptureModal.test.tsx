import * as AuthModule from '@repro/auth'
import { PortalRootProvider as DesignPortalRootProvider } from '@repro/design'
import * as DevToolsModule from '@repro/devtools'
import { PlaybackProvider } from '@repro/playback'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { resolve } from 'fluture'
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

/**
 * Mock @repro/api-client so useApiClient returns a controlled client.
 * The mock client's fetch returns a resolved Future with a project object,
 * allowing the create-project flow to complete synchronously in tests.
 */
mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => ({
      fetch: () => resolve({ id: 'new-proj-1', name: 'My New Project' }),
    }),
  },
})

// Must require() after mock registration so the mocks take effect
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureModal } =
  require('./CaptureModal') as typeof import('./CaptureModal')

const testPlayback = createPlaybackStub() as any

const testProjects = [
  { id: 'proj-1', name: 'Test Project' },
  { id: 'proj-2', name: 'Another Project' },
]

describe('CaptureModal', () => {
  afterEach(() => {
    cleanup()
    // Reset session to default
    currentSession = mockSession
  })

  after(() => {
    window.postMessage = originalPostMessage
  })

  function renderModal(
    projects: Array<{ id: string; name: string }>,
    selectedProjectId: string | null
  ) {
    return render(
      <DesignPortalRootProvider>
        <PlaybackProvider playback={testPlayback}>
          <CaptureModal
            open={true}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onProjectSelect={noop}
            onProjectCreated={noop}
            onClose={noop}
          />
        </PlaybackProvider>
      </DesignPortalRootProvider>
    )
  }

  it('renders download button regardless of save state', () => {
    renderModal(testProjects, 'proj-1')

    const downloadButton = screen.getByText('Download locally')
    assert.ok(downloadButton, 'Download tooltip should be rendered')
  })

  it('renders save tooltip describing normal save availability when projectId and session are available', () => {
    currentSession = mockSession
    renderModal(testProjects, 'proj-1')

    const tooltip = screen.getByText('Save recording to project')
    assert.ok(
      tooltip,
      'Tooltip should say "Save recording to project" when signed in and project exists'
    )
  })

  it('renders tooltip with sign-in prompt when session is null (not signed in)', () => {
    currentSession = null
    renderModal(testProjects, 'proj-1')

    const tooltip = screen.getByText('Sign in to save')
    assert.ok(
      tooltip,
      'Tooltip should show "Sign in to save" when session is null'
    )

    const lockIcon = document.querySelector('svg.lucide-lock')
    assert.ok(
      lockIcon,
      'Lock icon should be present in the tooltip when session is null'
    )
  })

  it('renders tooltip with project prompt when signed in but no project', () => {
    currentSession = mockSession
    renderModal(testProjects, null)

    const tooltip = screen.getByText(
      'Select or create a project to upload. You can still download locally.'
    )
    assert.ok(
      tooltip,
      'Tooltip should show project prompt when save is disabled (no project)'
    )
  })

  it('renders project selector when signed in with projects', () => {
    currentSession = mockSession
    renderModal(testProjects, null)

    const projectSelector = screen.getByText('Select a project…')
    assert.ok(
      projectSelector,
      'Project selector placeholder should render when signed in with projects'
    )
  })

  it('renders create-project form when signed in with zero projects', () => {
    currentSession = mockSession
    renderModal([], null)

    const input = screen.getByPlaceholderText('Project name')
    assert.ok(
      input,
      'Project name input should render when signed in with zero projects'
    )

    const createButton = screen.getByText('Create')
    assert.ok(
      createButton,
      'Create button should render when signed in with zero projects'
    )
  })

  it('does not render project selector when not signed in', () => {
    currentSession = null
    renderModal(testProjects, null)

    const projectSelector = screen.queryByText('Select a project…')
    assert.equal(
      projectSelector,
      null,
      'Project selector should not render when not signed in'
    )

    const createInput = screen.queryByPlaceholderText('Project name')
    assert.equal(
      createInput,
      null,
      'Create form should not render when not signed in'
    )
  })

  it('Save button is active when session is available and project is selected', () => {
    currentSession = mockSession
    renderModal(testProjects, 'proj-1')

    // The tooltip content reflects the canSave state
    const tooltip = screen.getByText('Save recording to project')
    assert.ok(
      tooltip,
      'Tooltip should show save-active message when project is selected'
    )

    // Clicking the Save trigger should open the popover when canSave is true.
    // Find the Save trigger by looking for text "Save" inside the header.
    // The trigger Row contains both a tooltip portal and "Save" text.
    const saveTrigger = screen.getByText('Save')
    assert.ok(saveTrigger, 'Save trigger text should exist')
    fireEvent.click(saveTrigger)

    // The popover should now be open — verify the popover content is rendered
    const popoverTitle = screen.getByText('Save recording')
    assert.ok(
      popoverTitle,
      'Popover title should appear after clicking Save trigger'
    )
  })

  it('shows create mode when plus button is clicked', () => {
    currentSession = mockSession
    renderModal(testProjects, null)

    const plusButton = screen.getByLabelText('Create new project')
    assert.ok(
      plusButton,
      'Create new project button should render when signed in with projects'
    )

    fireEvent.click(plusButton)

    const input = screen.getByPlaceholderText('Project name')
    assert.ok(
      input,
      'Project name input should appear after clicking plus button'
    )
  })

  it('onProjectSelect callback fires when a project option is selected', async () => {
    currentSession = mockSession

    const onProjectSelect = mock.fn<(projectId: string | null) => void>()

    render(
      <DesignPortalRootProvider>
        <PlaybackProvider playback={testPlayback}>
          <CaptureModal
            open={true}
            projects={testProjects}
            selectedProjectId={null}
            onProjectSelect={onProjectSelect}
            onProjectCreated={noop}
            onClose={noop}
          />
        </PlaybackProvider>
      </DesignPortalRootProvider>
    )

    const selectTrigger = screen.getByLabelText('Select project')
    assert.ok(selectTrigger, 'Select trigger should be rendered')

    fireEvent.click(selectTrigger)

    // Wait for the floating dropdown options to appear
    const option = await screen.findByText('Test Project', undefined, {
      timeout: 200,
    })
    assert.ok(option, 'Project option should be rendered in the dropdown')

    fireEvent.click(option)

    assert.equal(
      onProjectSelect.mock.callCount(),
      1,
      'onProjectSelect should be called once'
    )
    assert.equal(
      onProjectSelect.mock.calls[0]?.arguments[0],
      'proj-1',
      'onProjectSelect should be called with the selected project ID'
    )
  })

  it('Project creation API integration - calls onProjectCreated on success', () => {
    currentSession = mockSession

    const onProjectCreated = mock.fn<(projectId: string) => void>()

    render(
      <DesignPortalRootProvider>
        <PlaybackProvider playback={testPlayback}>
          <CaptureModal
            open={true}
            projects={[]}
            selectedProjectId={null}
            onProjectSelect={noop}
            onProjectCreated={onProjectCreated}
            onClose={noop}
          />
        </PlaybackProvider>
      </DesignPortalRootProvider>
    )

    const input = screen.getByPlaceholderText(
      'Project name'
    ) as HTMLInputElement
    fireEvent.input(input, { target: { value: 'My New Project' } })

    const createButton = screen.getByText('Create')
    assert.ok(createButton, 'Create button should be rendered')
    assert.ok(
      !(createButton as HTMLButtonElement).disabled,
      'Create button should not be disabled when input has text'
    )

    fireEvent.click(createButton)

    // The mocked apiClient.fetch returns a resolved Future,
    // so fork calls the success callback synchronously.
    assert.equal(
      onProjectCreated.mock.callCount(),
      1,
      'onProjectCreated should be called once'
    )
    assert.equal(
      onProjectCreated.mock.calls[0]?.arguments[0],
      'new-proj-1',
      'onProjectCreated should be called with the new project ID'
    )
  })
})
