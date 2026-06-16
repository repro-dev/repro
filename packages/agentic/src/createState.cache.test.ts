// Cache-hit verification test for token estimate caching in createState.
//
// IMPORTANT: This file must NOT contain a static import of "./createState".
// mock.module() only intercepts modules that have not yet been loaded into the
// module registry. A static import resolves at file-evaluation time, before any
// test body runs, so the mock would arrive too late to intercept the binding
// inside createState.ts. By keeping createState out of the static imports and
// using a dynamic import() inside the test body (after mock.module), we
// guarantee that createState.ts is first evaluated with the spy in place.
import { resolve } from 'fluture'

import assert from 'node:assert'
import { describe, it, mock } from 'node:test'

import type { RecordingDataAccessor, StreamProvider } from './types'

function waitForCondition(
  predicate: () => boolean,
  timeout = 10000
): Promise<void> {
  return new Promise((res, rej) => {
    const start = Date.now()
    function check() {
      if (predicate()) return res()
      if (Date.now() - start > timeout)
        return rej(new Error('waitForCondition timeout'))
      setTimeout(check, 10)
    }
    check()
  })
}

function makeTextStream(content: string): ReadableStream<{ data: string }> {
  const event = JSON.stringify({
    choices: [{ delta: { content } }],
  })
  return new ReadableStream<{ data: string }>({
    start(controller) {
      controller.enqueue({ data: event })
      controller.enqueue({ data: '[DONE]' })
      controller.close()
    },
  })
}

function makeToolCallStream(
  toolCallId: string,
  toolName: string,
  args = '{}'
): ReadableStream<{ data: string }> {
  const toolCallEvent = JSON.stringify({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: toolCallId,
              function: { name: toolName, arguments: args },
            },
          ],
        },
      },
    ],
  })
  return new ReadableStream<{ data: string }>({
    start(controller) {
      controller.enqueue({ data: toolCallEvent })
      controller.enqueue({ data: '[DONE]' })
      controller.close()
    },
  })
}

describe('createAgenticState — token estimate cache hit', () => {
  it('estimateTokens is called at most once per unique entry across multiple fetchResponse calls', async () => {
    // 1. Spy on estimateTokens BEFORE createState is loaded so that createState
    //    picks up the wrapped function when it is first evaluated.
    let estimateCallCount = 0
    const realTokenOptimization = await import('./model/token-optimization')
    const realEstimateTokens = realTokenOptimization.estimateTokens

    mock.module('./model/token-optimization', {
      namedExports: {
        ...realTokenOptimization,
        estimateTokens: (response: unknown) => {
          estimateCallCount++
          return realEstimateTokens(
            response as Parameters<typeof realEstimateTokens>[0]
          )
        },
      },
    })

    // 2. Dynamically import createState AFTER the mock is installed. Because
    //    this file has no static import of createState, the module registry does
    //    not yet contain it, so this dynamic import triggers a fresh evaluation
    //    with the mocked token-optimization module already in place.
    const { createAgenticState } = (await import(
      './createState'
    )) as typeof import('./createState')

    const accessor: RecordingDataAccessor = {
      getDuration: () => 0,
      getSnapshotAtTime: () => resolve(null),
      getEventsByType: () => resolve([]),
      getEventsInRange: () => resolve([]),
      getResourceMap: () => resolve({}),
    }

    let callCount = 0
    let secondRequestDone = false

    const streamProvider: StreamProvider = () => {
      callCount++
      if (callCount === 1) {
        // First request: return a tool call to force a second fetchResponse
        return resolve(
          makeToolCallStream('tc-spy', 'getRecordingDuration')
        ) as never
      }
      // Second request: return plain text to end the loop
      secondRequestDone = true
      return resolve(makeTextStream('done')) as never
    }

    const state = createAgenticState(streamProvider, accessor)

    // Reset the counter AFTER constructing state so that any setup-time calls
    // to estimateTokens (e.g. for the system card) are excluded from the
    // measurement. We only care about calls that happen inside fetchResponse.
    estimateCallCount = 0

    state.query('spy test query')

    await waitForCondition(() => secondRequestDone, 10000)
    // Give the final stream time to complete processing
    await new Promise(res => setTimeout(res, 200))

    const entries = state.$entries.getValue()
    const uniqueEntryCount = entries.length

    // The key invariant: estimateTokens must be called at most once per unique
    // entry across both fetchResponse calls combined.
    //
    // The tokenCache in createState stores the result keyed by entry ID so the
    // second fetchResponse call gets a cache hit for entries that already
    // existed when the first call ran.
    //
    // Allow headroom for:
    //   - The system message (estimated once per fetchResponse, not cached by ID)
    //   - The user entry pre-computation in query() (1 call, cached before
    //     setEntryMap fires so the first fetchResponse also gets a cache hit)
    //
    // With 2 fetchResponse calls and N unique entries:
    //   Without caching: up to 2*N calls
    //   With caching:    at most N calls + 2 (system message per call)
    const maxExpectedCalls = uniqueEntryCount + 4 // +4 = 2 system calls + 2 margin
    assert.ok(
      estimateCallCount <= maxExpectedCalls,
      `Expected estimateTokens to be called at most ${maxExpectedCalls} times ` +
        `(${uniqueEntryCount} unique entries + headroom), ` +
        `but was called ${estimateCallCount} times — suggests caching is not working`
    )

    state.destroy()
    mock.restoreAll()
  })
})
