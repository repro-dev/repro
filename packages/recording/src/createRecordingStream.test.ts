import { SourceEventType, SourceEventView } from '@repro/domain'
import { createEmptySnapshot } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createRecordingStream } from './createRecordingStream'

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

it.skip('starts in the shared test environment without a local shim', async () => {
  const stream = createRecordingStream(document, {
    types: new Set(['dom']),
  })

  try {
    assert.equal(stream.isStarted(), false)

    stream.start()

    assert.equal(stream.isStarted(), true)

    await new Promise(resolve => setTimeout(resolve, 5))

    assert.equal(stream.isStarted(), true)
  } finally {
    stream.stop()
  }

  assert.equal(stream.isStarted(), false)
})

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
