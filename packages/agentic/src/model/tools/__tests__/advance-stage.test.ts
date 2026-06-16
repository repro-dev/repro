import { fork, resolve, type FutureInstance } from 'fluture'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type {
  AdvanceStageResult,
  RecordingDataAccessor,
  ToolExecutionContext,
} from '../../../types'
import { handler } from '../advance-stage'

function runFuture<R>(future: FutureInstance<unknown, R>): Promise<R> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise))
  })
}

function makeAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => resolve(null),
    getResourceMap: () => resolve({}),
    getEventsByType: () => resolve([]),
    getEventsInRange: () => resolve([]),
  }
}

describe('advanceStage tool', () => {
  it('delegates valid payloads to the runtime callback', async () => {
    let received: unknown
    const context: ToolExecutionContext = {
      advanceStage: input => {
        received = input
        return resolve({
          stage: input.stage,
          hypotheses: input.hypotheses ?? [],
          readiness: 'ready to conclude',
        })
      },
    }

    const result = (await runFuture(
      handler(
        makeAccessor(),
        {
          stage: 'conclusion',
          hypotheses: [
            {
              id: 'h1',
              description: 'A',
              evidence: ['console error'],
              confidence: 'high',
            },
          ],
        },
        context
      )
    )) as AdvanceStageResult

    assert.deepEqual(received, {
      stage: 'conclusion',
      hypotheses: [
        {
          id: 'h1',
          description: 'A',
          evidence: ['console error'],
          confidence: 'high',
        },
      ],
    })
    assert.deepEqual(result, {
      stage: 'conclusion',
      hypotheses: [
        {
          id: 'h1',
          description: 'A',
          evidence: ['console error'],
          confidence: 'high',
        },
      ],
      readiness: 'ready to conclude',
      _tokenEstimate: result._tokenEstimate,
    })
    assert.equal(typeof result._tokenEstimate, 'number')
    assert.ok((result._tokenEstimate ?? 0) > 0)
  })

  it('preserves omitted hypotheses instead of clearing them', async () => {
    let received: unknown
    const context: ToolExecutionContext = {
      advanceStage: input => {
        received = input
        return resolve({
          stage: input.stage,
          hypotheses: [
            {
              id: 'keep',
              description: 'Keep existing',
              evidence: ['evidence'],
              confidence: 'medium',
            },
          ],
          readiness: 'needs more evidence',
        })
      },
    }

    const result = (await runFuture(
      handler(makeAccessor(), { stage: 'evidence' }, context)
    )) as AdvanceStageResult

    assert.equal(
      (received as { hypotheses?: Array<unknown> }).hypotheses,
      undefined
    )
    assert.equal(result.stage, 'evidence')
  })

  it('returns a structured error when the runtime callback is missing', async () => {
    const result = await runFuture(
      handler(makeAccessor(), {
        stage: 'orient',
      })
    )

    assert.ok(result !== null && typeof result === 'object')
    assert.equal(
      (result as { error: string }).error,
      'advanceStage is unavailable'
    )
  })

  it('rejects invalid stage and hypothesis payloads', async () => {
    const context: ToolExecutionContext = {
      advanceStage: () =>
        resolve({
          stage: 'orient',
          hypotheses: [],
          readiness: 'needs more evidence',
        }),
    }

    const invalidStage = await runFuture(
      handler(makeAccessor(), { stage: 'idle' }, context)
    )

    assert.ok(invalidStage !== null && typeof invalidStage === 'object')
    assert.equal(
      (invalidStage as { error: string }).error,
      'Invalid investigation stage'
    )

    const invalidHypotheses = await runFuture(
      handler(
        makeAccessor(),
        {
          stage: 'hypotheses',
          hypotheses: [{ id: '', description: '', evidence: [''] }],
        },
        context
      )
    )

    assert.ok(
      invalidHypotheses !== null && typeof invalidHypotheses === 'object'
    )
    assert.equal(
      (invalidHypotheses as { error: string }).error,
      'Invalid hypothesis'
    )
  })
})
