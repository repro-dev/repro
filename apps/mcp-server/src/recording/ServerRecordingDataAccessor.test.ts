import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ConsoleEventView,
  LogLevel,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { RecordingMode, RecordingInfo } from '@repro/domain'
import { List } from '@repro/tdl'
import { ServerRecordingDataAccessor } from './ServerRecordingDataAccessor'

function makeRecordingInfo(overrides: Partial<RecordingInfo> = {}): RecordingInfo {
  return {
    id: 'test-id',
    title: 'Test Recording',
    url: 'https://example.com',
    description: '',
    mode: RecordingMode.Snapshot,
    duration: 5000,
    createdAt: new Date().toISOString(),
    browserName: null,
    browserVersion: null,
    operatingSystem: null,
    codecVersion: '1.0',
    ...overrides,
  }
}

function makeEmptyEvents(): List<typeof SourceEventView> {
  return new List(SourceEventView, [])
}

function makeConsoleEvents(count: number): List<typeof SourceEventView> {
  const dataViews: DataView[] = []
  for (let i = 0; i < count; i++) {
    dataViews.push(
      ConsoleEventView.encode({
        type: SourceEventType.Console,
        time: i * 1000,
        data: { level: LogLevel.Info, parts: [], stack: [] },
      })
    )
  }
  return new List(SourceEventView, dataViews)
}

describe('ServerRecordingDataAccessor', () => {
  it('getDuration returns duration from recording info', () => {
    const info = makeRecordingInfo({ duration: 12345 })
    const accessor = new ServerRecordingDataAccessor(info, makeEmptyEvents())
    assert.equal(accessor.getDuration(), 12345)
  })

  it('getSourceEvents returns the events list', () => {
    const events = makeConsoleEvents(3)
    const accessor = new ServerRecordingDataAccessor(makeRecordingInfo(), events)
    assert.equal(accessor.getSourceEvents().size(), 3)
  })

  it('getSourceEvents returns the same list instance', () => {
    const events = makeEmptyEvents()
    const accessor = new ServerRecordingDataAccessor(makeRecordingInfo(), events)
    assert.equal(accessor.getSourceEvents(), events)
  })

  it('getSnapshotAtTime returns null when there are no snapshot events', () => {
    const events = makeConsoleEvents(3)
    const accessor = new ServerRecordingDataAccessor(makeRecordingInfo(), events)
    assert.equal(accessor.getSnapshotAtTime(1000), null)
  })

  it('getSnapshotAtTime returns null when no snapshot is before the given time', () => {
    const events = makeEmptyEvents()
    const accessor = new ServerRecordingDataAccessor(makeRecordingInfo(), events)
    assert.equal(accessor.getSnapshotAtTime(0), null)
  })
})
