import { PortalRootProvider } from '@repro/design'
import { RecordingMode, SourceEventType, SourceEventView } from '@repro/domain'
import { PlaybackProvider } from '@repro/playback'
import { UploadStage } from '@repro/recording-api'
import { Box, List } from '@repro/tdl'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { type FutureInstance, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it, mock } from 'node:test'
import React from 'react'

const noop = () => {}
const session = { id: 'session-1' }
let currentSession: typeof session | null = session
let sessionLoading = false
let loadSessionCalls = 0
const sessionListeners = new Set<() => void>()
const intents: Array<{ type: string; payload: Record<string, unknown> }> = []
const requests: Array<{
  path: string
  options?: { method?: string; body?: string }
}> = []

type FetchOptions = { method?: string; body?: string }
type Fetch = (
  path: string,
  options?: FetchOptions
) => FutureInstance<unknown, unknown>

let fetchResponse: Fetch = () =>
  resolve({
    items: [
      { id: 'project-1', name: 'MVP Pilot' },
      { id: 'project-2', name: 'Other Project' },
    ],
  })

function createSnapshotEvent(): DataView {
  return SourceEventView.encode(
    new Box({
      type: SourceEventType.Snapshot,
      time: 0,
      data: {
        dom: null,
        interaction: null,
        frameworkState: null,
        cssRules: null,
        colorScheme: null,
      },
    })
  )
}

const sourceEvents = new List(SourceEventView, [createSnapshotEvent()])

function createPlaybackStub() {
  return {
    getSourceEvents: () => sourceEvents,
    getDuration: () => 60_000,
    getBuffer: () => sourceEvents,
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

function loadSession() {
  loadSessionCalls++
  currentSession = session
  sessionListeners.forEach(listener => listener())
  return resolve(session)
}

mock.module('@repro/auth', {
  namedExports: {
    useSession: () =>
      React.useSyncExternalStore(
        listener => {
          sessionListeners.add(listener)
          return () => sessionListeners.delete(listener)
        },
        () => currentSession
      ),
    useSessionLoading: () => sessionLoading,
    useAuthContext: () => ({ loginPath: '/account/login', loadSession }),
  },
})

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => ({
      fetch: (path: string, options?: FetchOptions) => {
        requests.push({ path, options })
        return fetchResponse(path, options)
      },
    }),
  },
})

mock.module('@repro/messaging', {
  namedExports: {
    useMessaging: () => ({
      raiseIntent: (intent: {
        type: string
        payload: Record<string, unknown>
      }) => {
        intents.push(intent)
        if (intent.type === 'upload:progress') {
          return resolve({
            ref: 'upload-ref-1',
            recordingId: 'recording-1',
            encryptionKey: null,
            stages: {
              [UploadStage.Enqueued]: 1,
              [UploadStage.CreateRecording]: 1,
              [UploadStage.SaveEvents]: 1,
              [UploadStage.ReadResources]: 1,
              [UploadStage.SaveResources]: 1,
            },
            completed: true,
            error: null,
          })
        }
        return resolve('upload-ref-1')
      },
    }),
  },
})

mock.module('@repro/analytics', {
  namedExports: {
    Analytics: { track: noop },
  },
})

mock.module('@repro/devtools', {
  namedExports: {
    DevTools: () => null,
    useDevToolsView: () => [null, noop],
  },
})

mock.module('@repro/devtools/src/hooks', {
  namedExports: { useInspecting: () => [false, noop] },
})

mock.module('@repro/devtools/src/types', {
  namedExports: { View: { Console: 'console' } },
})

mock.module('~/state', {
  namedExports: {
    useRecordingMode: () => [RecordingMode.Snapshot, noop],
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureModal } =
  require('./CaptureModal') as typeof import('./CaptureModal')

const playback = createPlaybackStub() as any
const initialAppUrl = process.env.REPRO_APP_URL
process.env.REPRO_APP_URL = 'https://app.repro.test'

function renderModal() {
  return render(
    <PortalRootProvider>
      <PlaybackProvider playback={playback}>
        <CaptureModal open onClose={noop} />
      </PlaybackProvider>
    </PortalRootProvider>
  )
}

async function selectReportProject(name: string) {
  fireEvent.click(await screen.findByLabelText('Report project'))
  fireEvent.click(await screen.findByText(name))
}

function enterReport(title: string, description: string) {
  fireEvent.input(screen.getByRole('textbox', { name: 'Title' }), {
    target: { value: title },
  })
  fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: description },
  })
}

describe('CaptureModal report flow', () => {
  afterEach(() => {
    cleanup()
    currentSession = session
    sessionLoading = false
    loadSessionCalls = 0
    sessionListeners.clear()
    fetchResponse = () =>
      resolve({
        items: [
          { id: 'project-1', name: 'MVP Pilot' },
          { id: 'project-2', name: 'Other Project' },
        ],
      })
    intents.length = 0
    requests.length = 0
  })

  after(() => {
    if (initialAppUrl === undefined) {
      delete process.env.REPRO_APP_URL
    } else {
      process.env.REPRO_APP_URL = initialAppUrl
    }
  })

  it('submits the report with its project and captured recording, then opens the saved recording', async () => {
    let openedUrl: string | undefined
    const originalOpen = window.open
    window.open = ((url?: string | URL) => {
      openedUrl = String(url)
      return null
    }) as typeof window.open

    try {
      renderModal()

      await selectReportProject('MVP Pilot')
      enterReport('Checkout is broken', 'The submit action never completes.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

      await waitFor(() => {
        const upload = intents.find(intent => intent.type === 'upload:enqueue')
        assert.ok(
          upload,
          'report submission should enqueue the captured recording'
        )
        assert.equal(upload.payload.projectId, 'project-1')
        assert.equal(upload.payload.title, 'Checkout is broken')
        assert.equal(
          upload.payload.description,
          'The submit action never completes.'
        )
        assert.equal((upload.payload.events as string[]).length, 1)
        assert.equal(upload.payload.duration, 60_000)
      })

      assert.equal(screen.queryByText(/agentic debugging/i), null)
      assert.equal(
        requests.some(request => request.path === '/agentic/response'),
        false
      )

      fireEvent.click(
        await screen.findByRole('button', { name: 'Open in Repro' })
      )
      assert.equal(
        openedUrl,
        'https://app.repro.test/projects/project-1/recordings/recording-1'
      )
    } finally {
      window.open = originalOpen
    }
  })

  it('creates the selected destination project before enqueueing the report', async () => {
    const createdProjects: Array<{ path: string; body?: string }> = []
    fetchResponse = (path, options) => {
      if (options?.method === 'POST') {
        createdProjects.push({ path, body: options.body })
        return resolve({ id: 'created-project', name: 'New pilot' })
      }
      return resolve({
        items: [{ id: 'project-1', name: 'MVP Pilot' }],
      })
    }

    renderModal()
    fireEvent.click(await screen.findByLabelText('Report project'))
    fireEvent.click(await screen.findByText('Create new project…'))
    fireEvent.input(await screen.findByPlaceholderText('Project name'), {
      target: { value: 'New pilot' },
    })
    enterReport('Broken search', 'Search returns no results.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

    await waitFor(() => {
      assert.deepEqual(createdProjects, [
        { path: '/projects', body: JSON.stringify({ name: 'New pilot' }) },
      ])
      const upload = intents.find(intent => intent.type === 'upload:enqueue')
      assert.ok(upload)
      assert.equal(upload.payload.projectId, 'created-project')
      assert.equal(upload.payload.title, 'Broken search')
      assert.equal(upload.payload.description, 'Search returns no results.')
    })
  })

  it('keeps report details visible and prompts signed-out users without creating or uploading', async () => {
    currentSession = null
    let openedUrl: string | undefined
    const originalOpen = window.open
    const originalVisibilityState = Object.getOwnPropertyDescriptor(
      document,
      'visibilityState'
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    window.open = ((url?: string | URL) => {
      openedUrl = String(url)
      return null
    }) as typeof window.open

    try {
      renderModal()

      enterReport('Lost draft', 'Keep this report after sign-in.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

      assert.ok(
        await screen.findByText(/Your report details will stay in place/)
      )
      assert.ok(
        document.activeElement ===
          screen.getByRole('button', { name: 'Sign in' }),
        'the sign-in prompt should receive focus after a signed-out submit'
      )
      assert.equal(
        (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
          .value,
        'Lost draft'
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        'Keep this report after sign-in.'
      )
      assert.equal(
        intents.some(intent => intent.type === 'upload:enqueue'),
        false
      )
      assert.equal(
        requests.some(request => request.options?.method === 'POST'),
        false
      )

      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      assert.equal(openedUrl, 'https://app.repro.test/account/login')

      fireEvent(document, new window.Event('visibilitychange'))
      await waitFor(() => assert.equal(loadSessionCalls, 1))

      await selectReportProject('MVP Pilot')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

      await waitFor(() => {
        const upload = intents.find(intent => intent.type === 'upload:enqueue')
        assert.ok(
          upload,
          'returning from sign-in should allow report submission'
        )
        assert.equal(upload.payload.projectId, 'project-1')
        assert.equal(upload.payload.title, 'Lost draft')
        assert.equal(
          upload.payload.description,
          'Keep this report after sign-in.'
        )
      })
    } finally {
      window.open = originalOpen
      if (originalVisibilityState) {
        Object.defineProperty(
          document,
          'visibilityState',
          originalVisibilityState
        )
      } else {
        delete (document as { visibilityState?: DocumentVisibilityState })
          .visibilityState
      }
    }
  })

  it('does not treat a session-loading state as signed out', () => {
    currentSession = null
    sessionLoading = true

    renderModal()

    assert.ok(screen.getByRole('textbox', { name: 'Title' }))
    assert.equal(screen.queryByRole('button', { name: 'Sign in' }), null)
    assert.equal(
      (
        screen.getByRole('button', {
          name: 'Create Bug Report',
        }) as HTMLButtonElement
      ).disabled,
      true
    )
  })

  it('keeps report and title-only save project selections independent', async () => {
    renderModal()
    await selectReportProject('MVP Pilot')

    fireEvent.click(screen.getByText('Save'))
    const saveProject = await screen.findByLabelText('Select project')
    assert.equal(
      (saveProject as HTMLButtonElement).textContent,
      'Select a project…'
    )
  })
})
