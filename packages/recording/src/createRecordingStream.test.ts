import { SourceEventType, SourceEventView } from '@repro/domain'
import { createEmptySnapshot } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createRecordingStream } from './createRecordingStream'

if (!globalThis.requestIdleCallback) {
  globalThis.requestIdleCallback = ((callback: IdleRequestCallback) => {
    return setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 0 }),
      0
    )
  }) as typeof requestIdleCallback
}

if (!globalThis.cancelIdleCallback) {
  globalThis.cancelIdleCallback = ((handle: number) => {
    clearTimeout(handle)
  }) as typeof cancelIdleCallback
}

function createSnapshotEvent(time: number, value: string) {
  return SourceEventView.encode(
    new Box({
      time,
      type: SourceEventType.Snapshot,
      data: {
        ...createEmptySnapshot(),
        pageURL: value,
      },
    })
  )
}

function unwrapValue(value: any): any {
  return value && typeof value === 'object' && 'value' in value
    ? unwrapValue(value.value)
    : value
}

it('preserves buffered event ordering and timestamps through slice()', () => {
  const stream = createRecordingStream(document, {
    types: new Set() as any,
    ignoredNodes: [],
    ignoredSelectors: [],
  })

  stream.injectBufferedEvents([
    createSnapshotEvent(50, 'late'),
    createSnapshotEvent(10, 'early'),
  ])

  const events = stream.slice().toArray()
  const first = unwrapValue(events[0])
  const second = unwrapValue(events[1])

  assert.equal(events.length, 2)
  assert.equal(first.time, 0)
  assert.equal(second.time, 40)
})
