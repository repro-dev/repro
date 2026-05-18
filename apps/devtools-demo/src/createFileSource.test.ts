import { SourceEventType, SourceEventView } from '@repro/domain'
import { createEmptySnapshot } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createFileSource } from './createFileSource'

function createCanonicalBinaryPayload() {
  return toBinaryWireFormat([
    SourceEventView.encode(
      new Box({
        type: SourceEventType.Snapshot,
        time: 15,
        data: createEmptySnapshot(),
      })
    ),
    SourceEventView.encode(
      new Box({
        type: SourceEventType.Snapshot,
        time: 30,
        data: createEmptySnapshot(),
      })
    ),
  ])
}

async function waitForSourceState(source: ReturnType<typeof createFileSource>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = source.$readyState.getValue()

    if (state !== 'waiting') {
      return state
    }

    await new Promise(resolve => setTimeout(resolve, 0))
  }

  throw new Error('timed out waiting for file source to settle')
}

describe('createFileSource', () => {
  it('loads canonical binary wire-format files', async () => {
    const file = new File([createCanonicalBinaryPayload()], 'demo.repro')
    const source = createFileSource(file)

    assert.equal(await waitForSourceState(source), 'ready')
    assert.equal(source.$error.getValue(), null)
    assert.equal(source.$events.getValue().size(), 2)
    assert.equal(source.$duration.getValue(), 15)
  })

  it('fails malformed binary wire-format files', async () => {
    const serialized = createCanonicalBinaryPayload()
    const file = new File(
      [serialized.buffer.slice(0, serialized.byteLength - 1)],
      'broken.repro'
    )
    const source = createFileSource(file)

    assert.equal(await waitForSourceState(source), 'failed')
    assert.ok(source.$error.getValue() instanceof Error)
  })
})
