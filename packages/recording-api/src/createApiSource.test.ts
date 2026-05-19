import {
  InteractionType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'
import Future, { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { createApiSource } from './createApiSource'

function waitForCondition(predicate: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now()

    function tick() {
      if (predicate()) {
        resolve()
        return
      }

      if (Date.now() - startedAt > 2000) {
        reject(new Error('timed out waiting for source state'))
        return
      }

      setTimeout(tick, 0)
    }

    tick()
  })
}

describe('createApiSource', () => {
  afterEach(() => {
    // no-op; the test uses in-memory streams only
  })

  it('decodes stream chunks and becomes ready when the stream closes', async () => {
    const events = [
      SourceEventView.encode(
        new Box({
          type: SourceEventType.Interaction,
          time: 10,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [0, 0],
            to: [10, 10],
            duration: 25,
          }),
        })
      ),
      SourceEventView.encode(
        new Box({
          type: SourceEventType.Interaction,
          time: 30,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [10, 10],
            to: [20, 20],
            duration: 25,
          }),
        })
      ),
    ]

    const serialized = toBinaryWireFormat(events)
    const bytes = new Uint8Array(
      serialized.buffer,
      serialized.byteOffset,
      serialized.byteLength
    )
    const firstChunkEnd = 4 + events.length * 4 + 4 + events[0]!.byteLength

    const firstChunk = bytes.slice(0, firstChunkEnd)
    const secondChunk = bytes.slice(firstChunkEnd)

    let releaseResourceMap!: () => void
    const resourceMapReady = new Promise<void>(resolvePromise => {
      releaseResourceMap = resolvePromise
    })

    const calls: Array<string> = []
    const apiClient = {
      fetch(url: string) {
        calls.push(url)

        if (url.endsWith('/info')) {
          return resolve({ duration: 20 }) as never
        }

        if (url.endsWith('/resource-map')) {
          return Future((_, resolveFuture) => {
            const timer = setTimeout(() => {
              void resourceMapReady.then(() => resolveFuture({}))
            }, 10)

            return () => clearTimeout(timer)
          }) as never
        }

        return resolve(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(firstChunk)
              controller.enqueue(secondChunk)
              controller.close()
            },
          })
        ) as never
      },
    }

    const source = createApiSource(
      'project-1',
      'recording-1',
      apiClient as never
    )

    await waitForCondition(() => source.$events.getValue().size() === 2)
    releaseResourceMap()
    await waitForCondition(() => source.$readyState.getValue() === 'ready')

    assert.equal(calls[0], '/projects/project-1/recordings/recording-1/info')
    assert.match(
      calls.join('\n'),
      /\/projects\/project-1\/recordings\/recording-1\/data/
    )
    assert.match(
      calls.join('\n'),
      /\/projects\/project-1\/recordings\/recording-1\/resource-map/
    )
    assert.equal(source.$error.getValue(), null)
    assert.equal(source.$duration.getValue(), 20)
    assert.equal(source.$readyState.getValue(), 'ready')
    assert.equal(source.$events.getValue().size(), 2)
  })
})
