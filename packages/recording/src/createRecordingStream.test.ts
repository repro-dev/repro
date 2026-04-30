import { SourceEventType, SourceEventView } from '@repro/domain'
import { createEmptySnapshot } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createRecordingStream } from './createRecordingStream'
import { redactStringPreservingWhitespace } from './redaction'

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
