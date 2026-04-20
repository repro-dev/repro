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

it('captures rr-mask snapshots and live input updates as masked content', () => {
  const doc = document.implementation.createHTMLDocument('')
  const root = doc.createElement('div')
  root.className = 'rr-mask'

  const maskedText = doc.createTextNode('secret text')
  const maskedInput = doc.createElement('input')
  maskedInput.value = 'secret value'
  maskedInput.setAttribute('value', 'secret value')

  root.append(maskedText, maskedInput)
  doc.body.append(root)

  const stream = createRecordingStream(doc, {
    types: new Set(['dom']) as any,
    ignoredNodes: [],
    ignoredSelectors: ['.rr-ignore'],
  })

  stream.start()

  const snapshot = stream.snapshot()
  const dom = snapshot.dom

  assert.ok(dom)
  const nodeValues = Object.values(dom?.nodes ?? {}).map(node => {
    return unwrapValue((node as any).value)
  })
  const inputNode = nodeValues.find(
    node => node && typeof node === 'object' && node.tagName === 'input'
  ) as any

  assert.ok(nodeValues.includes('[MASKED]'))
  assert.equal(inputNode.properties.value, '[MASKED]')
  assert.equal(inputNode.attributes.value, '[MASKED]')

  maskedInput.value = 'changed secret value'

  const patches = stream
    .slice()
    .toArray()
    .map(event => unwrapValue(event))
    .filter(event => event.type === SourceEventType.DOMPatch)

  assert.ok(patches.length > 0)
  assert.equal((patches[patches.length - 1] as any).data.value, '[MASKED]')

  doc.body.removeChild(root)
})
