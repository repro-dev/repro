/**
 * Tests for runner.ts — specifically the StreamProviderFactory pattern
 * introduced in REP-639 where runSingle calls streamProviderFactory(fixture.systemPrompt).
 *
 * We mock ../createState and ./scorer to avoid real LLM calls and keep the
 * tests fast. Module mocks must be set up before the first import of the
 * module under test (runner.js), so we use a single top-level mock setup
 * and import runner.js once at the start of each test.
 *
 * Key scenarios verified:
 *   1. streamProviderFactory is called with fixture.systemPrompt
 *   2. streamProviderFactory is called exactly once per runSingle invocation
 *   3. Different fixtures with different systemPrompts cause different factory calls
 */

import assert from 'node:assert/strict'
import { BehaviorSubject } from 'rxjs'
import { describe, it, mock } from 'node:test'
import type { Loading, RecordingDataAccessor, StreamProvider } from '../types'
import type { EvalFixture } from './runner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFixture(overrides: Partial<EvalFixture> = {}): EvalFixture {
  return {
    name: 'test-fixture',
    prompt: 'What went wrong?',
    expectedOutcomeDescription: 'The agent identifies the bug',
    accessor: {} as RecordingDataAccessor,
    systemPrompt: 'You are a debugging agent. Use the tools.',
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
    ...overrides,
  }
}

/** Build a fake AgenticState whose $loading starts at 'none' so firstValueFrom resolves immediately. */
function makeFakeState() {
  const $loading = new BehaviorSubject<Loading>('none')
  const $entries = new BehaviorSubject<never[]>([])
  const $error = new BehaviorSubject(null)
  const $wasCancelled = new BehaviorSubject(false)
  return {
    $loading,
    $entries,
    $error,
    $wasCancelled,
    query: () => undefined,
    cancel: () => undefined,
    destroy: () => undefined,
    reset: () => undefined,
  }
}

const DEFAULT_SCORE = {
  correct: true,
  judgeReasoning: 'ok',
  iterationDepth: 2,
  toolErrorRate: 0.0,
  hitIterationLimit: false,
  qualityScore: { brevity: 3, directness: 3, signalNoise: 3 },
}

// ---------------------------------------------------------------------------
// runSingle — factory invocation (calls factory with fixture.systemPrompt)
// ---------------------------------------------------------------------------

describe('runSingle — StreamProviderFactory: called with fixture.systemPrompt', () => {
  it('passes fixture.systemPrompt as the argument to the factory', async t => {
    const fakeState = makeFakeState()
    t.mock.module('../createState.js', {
      namedExports: { createAgenticState: () => fakeState },
    })
    t.mock.module('./scorer.js', {
      namedExports: { scoreEvalRun: async () => DEFAULT_SCORE },
    })

    const { runSingle } = await import('./runner.js')

    let capturedSystemPrompt: string | undefined
    const factory = (systemPrompt: string): StreamProvider => {
      capturedSystemPrompt = systemPrompt
      return () => { throw new Error('provider should not be called') }
    }

    const fixture = makeFixture({ systemPrompt: 'custom-system-prompt-xyz' })
    await runSingle(fixture, factory, 'fake-api-key')

    assert.equal(
      capturedSystemPrompt,
      'custom-system-prompt-xyz',
      'factory should be called with fixture.systemPrompt',
    )
  })
})

// ---------------------------------------------------------------------------
// runSingle — factory call count
// ---------------------------------------------------------------------------

describe('runSingle — StreamProviderFactory: called exactly once per runSingle', () => {
  it('invokes the factory exactly once', async t => {
    const fakeState = makeFakeState()
    t.mock.module('../createState.js', {
      namedExports: { createAgenticState: () => fakeState },
    })
    t.mock.module('./scorer.js', {
      namedExports: { scoreEvalRun: async () => DEFAULT_SCORE },
    })

    const { runSingle } = await import('./runner.js')
    const fixture = makeFixture()

    let callCount = 0
    const factory = (_systemPrompt: string): StreamProvider => {
      callCount++
      return () => { throw new Error('provider should not be called') }
    }

    await runSingle(fixture, factory, 'fake-api-key')

    assert.equal(callCount, 1, 'factory should be called exactly once per runSingle')
  })
})

// ---------------------------------------------------------------------------
// runSingle — per-fixture systemPrompt isolation
// ---------------------------------------------------------------------------

describe('runSingle — StreamProviderFactory: different fixtures → different systemPrompts', () => {
  it('factory receives each fixture\'s own systemPrompt on consecutive calls', async t => {
    const fakeState = makeFakeState()
    t.mock.module('../createState.js', {
      namedExports: { createAgenticState: () => fakeState },
    })
    t.mock.module('./scorer.js', {
      namedExports: { scoreEvalRun: async () => DEFAULT_SCORE },
    })

    const { runSingle } = await import('./runner.js')

    const capturedPrompts: Array<string> = []
    const factory = (systemPrompt: string): StreamProvider => {
      capturedPrompts.push(systemPrompt)
      return () => { throw new Error('provider should not be called') }
    }

    await runSingle(makeFixture({ systemPrompt: 'prompt-A' }), factory, 'key')
    await runSingle(makeFixture({ systemPrompt: 'prompt-B' }), factory, 'key')

    assert.equal(capturedPrompts[0], 'prompt-A', 'first call should receive prompt-A')
    assert.equal(capturedPrompts[1], 'prompt-B', 'second call should receive prompt-B')
  })
})
