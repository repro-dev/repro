import { PortalRootProvider } from '@repro/design'
import { RecordingMode, SourceEventType, SourceEventView } from '@repro/domain'
import { PlaybackProvider } from '@repro/playback'
import { UploadStage } from '@repro/recording-api'
import { Box, List } from '@repro/tdl'
import { fireEvent, render, screen } from '@testing-library/react'
import { type FutureInstance, resolve } from 'fluture'
import { mock } from 'node:test'
import React from 'react'

export const noop = () => {}
export const session = { id: 'session-1' }
export const sessionListeners = new Set<() => void>()
export const intents: Array<{
  type: string
  payload: Record<string, unknown>
}> = []
export const requests: Array<{
  path: string
  options?: { method?: string; body?: string }
}> = []

type FetchOptions = { method?: string; body?: string }
type Fetch = (
  path: string,
  options?: FetchOptions
) => FutureInstance<unknown, unknown>

export function uploadProgress(completed: boolean) {
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
    completed,
    error: null,
  })
}

export const testState: {
  currentSession: typeof session | null
  sessionLoading: boolean
  loadSessionCalls: number
  fetchResponse: Fetch
  enqueueResponse: () => FutureInstance<unknown, unknown>
  progressResponse: () => FutureInstance<unknown, unknown>
} = {
  currentSession: session,
  sessionLoading: false,
  loadSessionCalls: 0,
  fetchResponse: () =>
    resolve({
      items: [
        { id: 'project-1', name: 'MVP Pilot' },
        { id: 'project-2', name: 'Other Project' },
      ],
    }),
  enqueueResponse: () => resolve('upload-ref-1'),
  progressResponse: () => uploadProgress(true),
}

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
  testState.loadSessionCalls++
  testState.currentSession = session
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
        () => testState.currentSession
      ),
    useSessionLoading: () => testState.sessionLoading,
    useAuthContext: () => ({ loginPath: '/account/login', loadSession }),
  },
})

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => ({
      fetch: (path: string, options?: FetchOptions) => {
        requests.push({ path, options })
        return testState.fetchResponse(path, options)
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
        if (intent.type === 'upload:progress')
          return testState.progressResponse()
        if (intent.type === 'upload:enqueue') return testState.enqueueResponse()
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
export const playback = createPlaybackStub() as any
export const initialAppUrl = process.env.REPRO_APP_URL
process.env.REPRO_APP_URL = 'https://app.repro.test'

export function restoreEnvironment() {
  if (initialAppUrl === undefined) {
    delete process.env.REPRO_APP_URL
  } else {
    process.env.REPRO_APP_URL = initialAppUrl
  }
}

export function resetCaptureModalTestState() {
  testState.currentSession = session
  testState.sessionLoading = false
  testState.loadSessionCalls = 0
  testState.fetchResponse = () =>
    resolve({
      items: [
        { id: 'project-1', name: 'MVP Pilot' },
        { id: 'project-2', name: 'Other Project' },
      ],
    })
  testState.enqueueResponse = () => resolve('upload-ref-1')
  testState.progressResponse = () => uploadProgress(true)
  sessionListeners.clear()
  intents.length = 0
  requests.length = 0
}

export function refreshSession() {
  testState.currentSession = { ...session }
  sessionListeners.forEach(listener => listener())
}

export function modalTree(open = true) {
  return (
    <PortalRootProvider>
      <PlaybackProvider playback={playback}>
        <CaptureModal open={open} onClose={noop} />
      </PlaybackProvider>
    </PortalRootProvider>
  )
}

export function renderModal(open = true) {
  return render(modalTree(open))
}

export function uploadEnqueueCount() {
  return intents.filter(intent => intent.type === 'upload:enqueue').length
}

export async function selectReportProject(name: string) {
  fireEvent.click(await screen.findByLabelText('Report project'))
  const options = await screen.findAllByText(name)
  fireEvent.click(options[options.length - 1]!)
}

export function enterReport(title: string, description: string) {
  fireEvent.input(screen.getByRole('textbox', { name: 'Title' }), {
    target: { value: title },
  })
  fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: description },
  })
}
