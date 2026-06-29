import {
  LogLevel,
  RecordingMode,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box, List } from '@repro/tdl'
import { render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

import type { RecordingActions } from './useRecordingActions'

let toBinaryWireFormatShouldThrow = false

mock.module('@repro/wire-formats', {
  namedExports: {
    toBinaryWireFormat: () => {
      if (toBinaryWireFormatShouldThrow) {
        throw new Error('Mock encoding failure')
      }
      return new DataView(new ArrayBuffer(0))
    },
  },
})

// Must require() after mock registration so the mocks take effect
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useRecordingActions } =
  require('./useRecordingActions') as typeof import('./useRecordingActions')

function createSnapshotEvent(time: number): DataView {
  return SourceEventView.encode(
    new Box({
      type: SourceEventType.Snapshot,
      time,
      data: {
        dom: null,
        interaction: null,
        frameworkState: null,
        cssRules: null,
      },
    })
  )
}

function createConsoleEvent(time: number): DataView {
  return SourceEventView.encode(
    new Box({
      type: SourceEventType.Console,
      time,
      data: {
        level: LogLevel.Info,
        parts: [],
        stack: [],
      },
    })
  )
}

function createMockPlayback(overrides: Record<string, unknown> = {}) {
  const mockEvents = new List(SourceEventView, [createSnapshotEvent(0)])

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
  recordingMode: number
  selectedDuration: number
}> = ({ playback, recordingMode, selectedDuration }) => {
  const actions = useRecordingActions(
    playback as any,
    recordingMode as any,
    selectedDuration
  )
  ;(globalThis as any).__testRecordingActions = actions
  return null
}

function renderHook(
  playback: ReturnType<typeof createMockPlayback>,
  recordingMode: number = 1,
  selectedDuration: number = 60000
) {
  ;(globalThis as any).__testRecordingActions = null

  render(
    <TestHarness
      playback={playback}
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
  })

  it('getSelectedRecording exposes the actual replay slice source offset and span', () => {
    const sourceEvents = new List(SourceEventView, [
      createSnapshotEvent(10),
      createConsoleEvent(25),
      createConsoleEvent(75),
      createConsoleEvent(100),
    ])
    const playback = createMockPlayback({
      getDuration: () => 100,
      getSourceEvents: () => sourceEvents,
    })
    const actions = renderHook(playback, RecordingMode.Replay, 50)

    const result = actions.getSelectedRecording()
    const eventTimes = result.events.toSource().map(event =>
      SourceEventView.decode(event)
        .map(event => event.time)
        .orElse(-1)
    )

    assert.deepEqual(eventTimes, [0, 50, 75])
    assert.equal(result.duration, 75)
    assert.equal(result.startTimeMs, 25)
  })

  it('getSelectedRecording caps replay selected duration at playback duration', () => {
    const playback = createMockPlayback({
      getDuration: () => 20000,
    })
    const actions = renderHook(playback, RecordingMode.Replay, 60000)

    const result = actions.getSelectedRecording()

    assert.equal(result.duration, 20000)
    assert.equal(result.startTimeMs, 0)
  })

  it('getSelectedRecording keeps full source events outside replay mode', () => {
    const playback = createMockPlayback({
      getDuration: () => 100000,
    })
    const actions = renderHook(playback, RecordingMode.Snapshot, 30000)

    const result = actions.getSelectedRecording()

    assert.equal(result.duration, 100000)
    assert.equal(result.startTimeMs, 0)
  })

  it('getSelectedRecording falls back to full source events in replay mode when no snapshot is found', () => {
    const sourceEvents = new List(SourceEventView, [
      createConsoleEvent(10),
      createConsoleEvent(50),
    ])
    const playback = createMockPlayback({
      getDuration: () => 100,
      getSourceEvents: () => sourceEvents,
    })
    const actions = renderHook(playback, RecordingMode.Replay, 50)

    const result = actions.getSelectedRecording()

    assert.equal(result.duration, 100)
    assert.equal(result.startTimeMs, 0)
  })

  it('downloadLocally creates a binary .repro download', () => {
    const playback = createMockPlayback()
    const actions = renderHook(playback, 1, 60000)

    let capturedBlob: Blob | null = null
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = (blob: Blob) => {
      capturedBlob = blob
      return 'blob:test-url'
    }

    let appendedChild: HTMLElement | null = null
    const originalAppendChild = document.body.appendChild.bind(document.body)
    document.body.appendChild = <T extends Node>(child: T) => {
      appendedChild = child as unknown as HTMLElement
      return originalAppendChild(child)
    }

    try {
      actions.downloadLocally()

      assert.ok(capturedBlob)
      assert.equal((capturedBlob as Blob).type, 'application/octet-stream')
      assert.ok(appendedChild)
      assert.ok(
        (appendedChild as HTMLAnchorElement).download.endsWith('.repro')
      )
      assert.ok(
        (appendedChild as HTMLAnchorElement).download.startsWith(
          'repro-recording-'
        )
      )
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      document.body.appendChild = originalAppendChild
    }
  })

  it('downloadLocally does not call URL.createObjectURL for empty recording', () => {
    const emptyEvents = new List(SourceEventView, [])
    const playback = createMockPlayback({
      getSourceEvents: () => emptyEvents,
    })
    const actions = renderHook(playback, 1, 60000)

    let createObjectURLCalled = false
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = () => {
      createObjectURLCalled = true
      return 'blob:test-url'
    }

    try {
      actions.downloadLocally()

      assert.equal(createObjectURLCalled, false)
    } finally {
      URL.createObjectURL = originalCreateObjectURL
    }
  })

  it('downloadLocally handles toBinaryWireFormat failure', () => {
    toBinaryWireFormatShouldThrow = true
    try {
      const playback = createMockPlayback()
      const actions = renderHook(playback, 1, 60000)

      let appendedChild: HTMLElement | null = null
      const originalAppendChild = document.body.appendChild.bind(document.body)
      document.body.appendChild = <T extends Node>(child: T) => {
        appendedChild = child as unknown as HTMLElement
        return originalAppendChild(child)
      }

      try {
        actions.downloadLocally()

        assert.equal(appendedChild, null)
      } finally {
        document.body.appendChild = originalAppendChild
      }
    } finally {
      toBinaryWireFormatShouldThrow = false
    }
  })
})
