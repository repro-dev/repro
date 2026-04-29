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
  }) as unknown as typeof requestIdleCallback
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

it('keeps live buffered events flowing after start in event order', () => {
  const stream = createRecordingStream(document, {
    types: new Set() as any,
    ignoredNodes: [],
    ignoredSelectors: [],
  })

  stream.injectBufferedEvents([createSnapshotEvent(10, 'pre')])
  stream.$started.next(true)
  stream.injectBufferedEvents([createSnapshotEvent(30, 'live')])

  assert.equal(stream.slice().toArray().length, 2)
})

it('captures custom marks and restores the previous hook on stop', () => {
  const previousMarkCalls: Array<{
    name: string
    data?: Record<string, unknown>
  }> = []

  window.__REPRO__ = {
    mark(name: string, data?: Record<string, unknown>) {
      previousMarkCalls.push({ name, data })
    },
    captureState() {
      return undefined
    },
  }

  const repro = window.__REPRO__!
  const originalMark = repro.mark
  const stream = createRecordingStream(document, {
    types: new Set(['custom']) as any,
    ignoredNodes: [],
    ignoredSelectors: [],
  })

  stream.start()
  repro.mark?.('user_action', { nested: true })

  const events = stream.slice().toArray()
  const customMark = unwrapValue(events[events.length - 1])

  assert.equal(customMark.type, SourceEventType.CustomMark)
  assert.deepEqual(customMark.data, {
    name: 'user_action',
    data: '{"nested":true}',
    frameId: 0,
  })
  assert.equal(previousMarkCalls.length, 1)
  assert.notEqual(repro.mark, originalMark)

  stream.stop()

  assert.equal(repro.mark, originalMark)
  delete window.__REPRO__
})
