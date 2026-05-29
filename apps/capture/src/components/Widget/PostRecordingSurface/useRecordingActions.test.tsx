import { SourceEventView } from '@repro/domain'
import { List } from '@repro/tdl'
import { act, render } from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

import type { RecordingActions } from './useRecordingActions'

const trackedIntents: Array<{ type: string; payload: unknown }> = []
let trackedAnalyticsEvent: string | null = null
let trackedAnalyticsProps: Record<string, string> | null = null

mock.module('@repro/messaging', {
  namedExports: {
    useMessaging: () => ({
      raiseIntent: (...args: Array<unknown>) => {
        const intent = args[0] as { type: string; payload: unknown }
        trackedIntents.push({ type: intent.type, payload: intent.payload })
        return resolve('mock-upload-ref-123')
      },
    }),
  },
})

mock.module('@repro/analytics', {
  namedExports: {
    Analytics: {
      track: (event: string, props: Record<string, string>) => {
        trackedAnalyticsEvent = event
        trackedAnalyticsProps = props
      },
    },
  },
})

mock.module('@repro/recording', {
  namedExports: {
    sliceEventsAtRange: (events: any) => events,
  },
})

// Must require() after mock registration so the mocks take effect
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useRecordingActions } =
  require('./useRecordingActions') as typeof import('./useRecordingActions')

function createMockPlayback(overrides: Record<string, unknown> = {}) {
  const mockDataView = new DataView(new ArrayBuffer(8))
  mockDataView.setFloat64(0, 0, true)

  const mockEvents = new List(SourceEventView, [mockDataView])

  return {
    getSourceEvents: () => mockEvents,
    getDuration: () => 60000,
    getBuffer: () => mockEvents,
    getSnapshot: () => ({}),
    getResourceMap: () => ({}),
    copy: () => createMockPlayback(overrides),
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
    ...overrides,
  }
}

const TestHarness: React.FC<{
  playback: ReturnType<typeof createMockPlayback>
  projectId: string | null
  recordingMode: number
  selectedDuration: number
}> = ({ playback, projectId, recordingMode, selectedDuration }) => {
  const actions = useRecordingActions(
    playback as any,
    projectId,
    recordingMode as any,
    selectedDuration
  )
  ;(globalThis as any).__testRecordingActions = actions
  return null
}

function renderHook(
  playback: ReturnType<typeof createMockPlayback>,
  projectId: string | null = 'proj-1',
  recordingMode: number = 1,
  selectedDuration: number = 60000
) {
  ;(globalThis as any).__testRecordingActions = null

  render(
    <TestHarness
      playback={playback}
      projectId={projectId}
      recordingMode={recordingMode}
      selectedDuration={selectedDuration}
    />
  )

  const actions = (globalThis as any)
    .__testRecordingActions as RecordingActions | null
  if (!actions) {
    throw new Error('useRecordingActions did not set __testRecordingActions')
  }
  return actions
}

describe('useRecordingActions', () => {
  afterEach(() => {
    ;(globalThis as any).__testRecordingActions = null
    trackedIntents.length = 0
    trackedAnalyticsEvent = null
    trackedAnalyticsProps = null
  })

  it('getSerializedEvents returns events for given duration range', () => {
    const playback = createMockPlayback({
      getDuration: () => 100000,
    })
    const actions = renderHook(playback, 'proj-1', 1, 30000)

    const result = actions.getSerializedEvents()

    assert.ok(result)
    assert.ok(Array.isArray(result.byteStrings))
  })

  it('enqueueUpload raises upload:enqueue intent with serialized payload', () => {
    const playback = createMockPlayback()
    const actions = renderHook(playback, 'proj-1', 1, 60000)

    actions.enqueueUpload({ title: 'Test bug', description: 'Description' })

    assert.equal(trackedIntents.length, 1)
    assert.equal(trackedIntents[0]!.type, 'upload:enqueue')
    const payload = trackedIntents[0]!.payload as Record<string, unknown>
    assert.equal(payload.title, 'Test bug')
    assert.equal(payload.description, 'Description')
    assert.equal(payload.projectId, 'proj-1')
  })

  it('enqueueUpload tracks analytics event', () => {
    const playback = createMockPlayback()
    const actions = renderHook(playback, 'proj-1', 1, 60000)

    actions.enqueueUpload({ title: 'Test bug', description: 'Description' })

    assert.equal(trackedAnalyticsEvent, 'capture:save-start')
    assert.ok(trackedAnalyticsProps)
    assert.ok(trackedAnalyticsProps!.recordingSize)
  })

  it('downloadLocally creates a download link and triggers download', () => {
    const playback = createMockPlayback()
    const actions = renderHook(playback, 'proj-1', 1, 60000)

    let createdBlobUrl: string | null = null
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = (_blob: Blob) => {
      createdBlobUrl = 'blob:test-url'
      return createdBlobUrl
    }

    let appendedChild: HTMLElement | null = null
    const originalAppendChild = document.body.appendChild.bind(document.body)
    document.body.appendChild = <T extends Node>(child: T) => {
      appendedChild = child as unknown as HTMLElement
      return originalAppendChild(child)
    }

    try {
      actions.downloadLocally()
      assert.ok(createdBlobUrl)
      assert.ok(appendedChild)
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      document.body.appendChild = originalAppendChild
    }
  })

  it('uploadState is initialized correctly', () => {
    const playback = createMockPlayback()
    const actions = renderHook(playback, null, 1, 60000)

    assert.equal(actions.uploadState.isUploading, false)
    assert.equal(actions.uploadState.progress, null)
    assert.equal(actions.uploadState.error, null)
    assert.equal(actions.uploadState.uploadRef, null)
  })

  it('sets uploadState on successful enqueueUpload fork resolution', async () => {
    const playback = createMockPlayback()
    renderHook(playback, 'proj-1', 1, 60000)

    const actions = (globalThis as any)
      .__testRecordingActions as RecordingActions | null
    actions!.enqueueUpload({
      title: 'Test bug',
      description: 'Description',
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const updatedActions = (globalThis as any)
      .__testRecordingActions as RecordingActions | null
    assert.equal(updatedActions!.uploadState.isUploading, true)
    assert.equal(updatedActions!.uploadState.uploadRef, 'mock-upload-ref-123')
    assert.equal(updatedActions!.uploadState.error, null)
  })

  it('does not enqueue upload when projectId is null', () => {
    const playback = createMockPlayback()
    const actions = renderHook(playback, null, 1, 60000)

    actions.enqueueUpload({ title: 'Test bug', description: 'Description' })

    assert.equal(trackedIntents.length, 0)
  })
})
