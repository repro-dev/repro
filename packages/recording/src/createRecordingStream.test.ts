import { SourceEventType, SourceEventView } from '@repro/domain'
import { createEmptySnapshot } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createRecordingStream } from './createRecordingStream'
import { redactStringPreservingWhitespace } from './redaction'

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

// This integration case currently leaves the raw tsx/node:test runner stuck.
// Lower-level masking coverage lives in the DOM, console, and interaction observer tests.
it.skip('captures selector-masked snapshots and live input updates as layout-preserving masked content', () => {
  const root = document.createElement('div')
  root.className = 'repro-mask'

  const maskedText = document.createTextNode('secret text\nmore secret')
  const maskedInput = document.createElement('input')
  maskedInput.value = 'secret value'
  maskedInput.setAttribute('value', 'secret value')

  const maskedOption = document.createElement('option')
  maskedOption.value = 'secret option'
  maskedOption.setAttribute('value', 'secret option')
  maskedOption.textContent = 'public label'

  root.append(maskedText, maskedInput, maskedOption)
  document.body.append(root)

  const stream = createRecordingStream(document, {
    types: new Set(['dom']) as any,
    ignoredNodes: [],
    ignoredSelectors: ['.rr-ignore'],
    maskedSelectors: ['.repro-mask'],
  })

  try {
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
    const optionNode = nodeValues.find(
      node => node && typeof node === 'object' && node.tagName === 'option'
    ) as any
    const maskedTextValue = nodeValues.find(
      node => typeof node === 'string' && node.includes('\n')
    ) as string

    assert.equal(maskedTextValue.length, 'secret text\nmore secret'.length)
    assert.equal(maskedTextValue.includes('\n'), true)
    assert.equal(
      inputNode.properties.value,
      redactStringPreservingWhitespace('secret value')
    )
    assert.equal(
      inputNode.attributes.value,
      redactStringPreservingWhitespace('secret value')
    )
    assert.equal(
      optionNode.attributes.value,
      redactStringPreservingWhitespace('secret option')
    )

    maskedInput.value = 'changed secret value'
    const patches = stream
      .slice()
      .toArray()
      .map(event => unwrapValue(event))
      .filter(event => event.type === SourceEventType.DOMPatch)

    assert.ok(patches.length > 0)
    const valuePatch = patches
      .map(event => (event as any).data?.value)
      .find((patch: any) => patch?.name === 'value')

    assert.ok(valuePatch)
    assert.equal(
      valuePatch.value,
      redactStringPreservingWhitespace('changed secret value')
    )
  } finally {
    stream.stop()
    document.body.removeChild(root)
  }
})
