import { SourceEventType, SourceEventView } from '@repro/domain'
import { createEmptySnapshot } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import { createFixtureSource } from './createFixtureSource'

function createCanonicalBinaryPayload() {
  return toBinaryWireFormat([
    SourceEventView.encode(
      new Box({
        type: SourceEventType.Snapshot,
        time: 10,
        data: createEmptySnapshot(),
      })
    ),
    SourceEventView.encode(
      new Box({
        type: SourceEventType.Snapshot,
        time: 40,
        data: createEmptySnapshot(),
      })
    ),
  ])
}

async function waitForSourceState(
  source: ReturnType<typeof createFixtureSource>
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = source.$readyState.getValue()

    if (state !== 'waiting') {
      return state
    }

    await new Promise(resolve => setTimeout(resolve, 0))
  }

  throw new Error('timed out waiting for fixture source to settle')
}

describe('createFixtureSource', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('loads canonical binary wire-format fixtures', async () => {
    const serialized = createCanonicalBinaryPayload()

    globalThis.fetch = async () =>
      new Response(new Blob([serialized])) as Response

    const source = createFixtureSource('/sources/demo.repro')

    expect(await waitForSourceState(source)).toBe('ready')
    expect(source.$error.getValue()).toBeNull()
    expect(source.$events.getValue().size()).toBe(2)
    expect(source.$duration.getValue()).toBe(30)
  })

  it('fails malformed binary wire-format fixtures', async () => {
    const serialized = createCanonicalBinaryPayload()

    globalThis.fetch = async () =>
      new Response(
        new Blob([serialized.buffer.slice(0, serialized.byteLength - 1)])
      ) as Response

    const source = createFixtureSource('/sources/broken.repro')

    expect(await waitForSourceState(source)).toBe('failed')
    expect(source.$error.getValue()).toBeInstanceOf(Error)
  })
})
