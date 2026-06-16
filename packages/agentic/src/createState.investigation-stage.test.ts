import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createAgenticState,
  type RecordingDataAccessor,
  type StreamProvider,
} from './index'

function makeAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => resolve(null),
    getResourceMap: () => resolve({}),
    getEventsByType: () => resolve([]),
    getEventsInRange: () => resolve([]),
  }
}

function makeDoneStream(): ReadableStream<{ data: string }> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ data: '[DONE]' })
      controller.close()
    },
  })
}

function makeToolCallStream(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>
): ReadableStream<{ data: string }> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: toolCallId,
                    function: {
                      name: toolName,
                      arguments: JSON.stringify(args),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      controller.enqueue({ data: '[DONE]' })
      controller.close()
    },
  })
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const started = Date.now()

    function check() {
      if (predicate()) {
        resolvePromise()
        return
      }

      if (Date.now() - started > timeoutMs) {
        rejectPromise(new Error('Timed out waiting for condition'))
        return
      }

      setTimeout(check, 10)
    }

    check()
  })
}

describe('createAgenticState investigation stage', () => {
  it('starts idle, enters orient on query, and resets back to idle', async () => {
    const streamProvider: StreamProvider = () =>
      resolve(makeDoneStream()) as never
    const state = createAgenticState(streamProvider, makeAccessor())

    assert.equal(state.$stage.getValue(), 'idle')
    assert.deepEqual(state.$hypotheses.getValue(), [])

    state.query('Why did this fail?')

    assert.equal(state.$stage.getValue(), 'orient')

    await waitFor(() => state.$loading.getValue() === 'none')

    state.reset()

    assert.equal(state.$stage.getValue(), 'idle')
    assert.deepEqual(state.$hypotheses.getValue(), [])

    state.destroy()
  })

  it('advances through hypotheses, evidence, and conclusion when supported', async () => {
    const hypotheses = [
      {
        id: 'h1',
        description: 'The request is failing before render',
        evidence: [],
        confidence: 'medium' as const,
      },
    ]

    let callCount = 0
    const streamProvider: StreamProvider = () => {
      callCount += 1

      if (callCount === 1) {
        return resolve(
          makeToolCallStream('advance-hypotheses', 'advanceStage', {
            stage: 'hypotheses',
            hypotheses,
          })
        ) as never
      }

      if (callCount === 2) {
        return resolve(
          makeToolCallStream('advance-evidence', 'advanceStage', {
            stage: 'evidence',
            hypotheses: [
              {
                ...hypotheses[0],
                evidence: ['console error at 3.2s'],
              },
            ],
          })
        ) as never
      }

      if (callCount === 3) {
        return resolve(
          makeToolCallStream('advance-conclusion', 'advanceStage', {
            stage: 'conclusion',
            hypotheses: [
              {
                ...hypotheses[0],
                evidence: ['console error at 3.2s'],
              },
            ],
          })
        ) as never
      }

      return resolve(makeDoneStream()) as never
    }

    const state = createAgenticState(streamProvider, makeAccessor())

    state.query('Why did the button stop working?')

    await waitFor(() => state.$loading.getValue() === 'none')

    assert.equal(state.$stage.getValue(), 'conclusion')
    assert.deepEqual(state.$hypotheses.getValue(), [
      {
        id: 'h1',
        description: 'The request is failing before render',
        evidence: ['console error at 3.2s'],
        confidence: 'medium',
      },
    ])

    state.destroy()
  })

  it('blocks conclusion without evidence and leaves the stage unchanged', async () => {
    let callCount = 0
    const streamProvider: StreamProvider = () => {
      callCount += 1

      if (callCount === 1) {
        // orient → hypotheses
        return resolve(
          makeToolCallStream('advance-hypotheses', 'advanceStage', {
            stage: 'hypotheses',
            hypotheses: [
              {
                id: 'h1',
                description: 'The request is failing before render',
                evidence: ['some observation'],
              },
            ],
          })
        ) as never
      }

      if (callCount === 2) {
        // hypotheses → evidence (carry forward the hypothesis with evidence)
        return resolve(
          makeToolCallStream('advance-evidence', 'advanceStage', {
            stage: 'evidence',
            hypotheses: [
              {
                id: 'h1',
                description: 'The request is failing before render',
                evidence: ['some observation'],
              },
            ],
          })
        ) as never
      }

      if (callCount === 3) {
        // evidence → conclusion — attempt with empty evidence hypothesis
        return resolve(
          makeToolCallStream('advance-conclusion', 'advanceStage', {
            stage: 'conclusion',
            hypotheses: [
              {
                id: 'h2',
                description: 'Unsupported hypothesis',
                evidence: [],
              },
            ],
          })
        ) as never
      }

      return resolve(makeDoneStream()) as never
    }

    const state = createAgenticState(streamProvider, makeAccessor())

    state.query('Why did this fail?')

    await waitFor(() => state.$loading.getValue() === 'none')

    // Stage should have advanced through hypotheses and evidence, but the
    // conclusion attempt with empty evidence should keep the stage at evidence.
    assert.equal(state.$stage.getValue(), 'evidence')

    const toolMessages = state.$entries
      .getValue()
      .filter(entry => entry.role === 'tool')

    // The last tool message is the rejected conclusion attempt
    const lastToolMessage = toolMessages[toolMessages.length - 1]
    assert.ok(lastToolMessage)
    assert.match(
      JSON.stringify(lastToolMessage.content),
      /Conclusion requires evidence/
    )

    state.destroy()
  })
})
