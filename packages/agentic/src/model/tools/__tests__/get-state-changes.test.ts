import { SourceEventType, SourceEventView, StateEventType } from '@repro/domain'
import { Box } from '@repro/tdl'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { executeTool, tools } from '../index'
import { makeAccessor, makeEmptyAccessor, runFuture } from './helpers'

// ─── State event factories ────────────────────────────────────────────────────

function makeReactCommitEvent(
  time: number,
  componentName: string,
  propsDelta = '{}',
  hooksDelta = '{}',
  fiberNodeId = 1
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — plain Box avoids binary codec complexities.
  // The accessor only reads .get("time") and .get("type"); the handler reads .get("data").
  return new Box({
    type: SourceEventType.State,
    time,
    data: new Box({
      type: StateEventType.ReactCommit,
      time,
      frameId: 1,
      componentName,
      propsDelta,
      hooksDelta,
      fiberNodeId,
      parentFiberId: null,
      commitBatchId: null,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>
}

function makeReduxDispatchEvent(
  time: number,
  actionType: string,
  actionPayload = '{}',
  stateDiff = '{}'
): ReturnType<typeof SourceEventView.from> {
  return new Box({
    type: SourceEventType.State,
    time,
    data: new Box({
      type: StateEventType.ReduxDispatch,
      time,
      frameId: 1,
      actionType,
      actionPayload,
      stateDiff,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>
}

function makeVuexMutationEvent(
  time: number,
  mutationType: string
): ReturnType<typeof SourceEventView.from> {
  return new Box({
    type: SourceEventType.State,
    time,
    data: new Box({
      type: StateEventType.VuexMutation,
      time,
      frameId: 1,
      mutationType,
      payload: '{}',
      stateDiff: '{}',
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>
}

function makeVueComponentUpdateEvent(
  time: number,
  componentName: string,
  uid = 1,
  propsDelta = '{}',
  setupStateDelta = '{}'
): ReturnType<typeof SourceEventView.from> {
  return new Box({
    type: SourceEventType.State,
    time,
    data: new Box({
      type: StateEventType.VueComponentUpdate,
      time,
      frameId: 1,
      componentName,
      uid,
      propsDelta,
      setupStateDelta,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>
}

function makeVuexActionEvent(
  time: number,
  actionType: string,
  payload = '{}'
): ReturnType<typeof SourceEventView.from> {
  return new Box({
    type: SourceEventType.State,
    time,
    data: new Box({
      type: StateEventType.VuexAction,
      time,
      frameId: 1,
      actionType,
      payload,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>
}

function makePiniaActionEvent(
  time: number,
  storeId: string,
  actionName: string,
  args = '[]',
  stateDiff = '{}'
): ReturnType<typeof SourceEventView.from> {
  return new Box({
    type: SourceEventType.State,
    time,
    data: new Box({
      type: StateEventType.PiniaAction,
      time,
      frameId: 1,
      storeId,
      actionName,
      args,
      stateDiff,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>
}

// ─── Tool definition tests ────────────────────────────────────────────────────

describe('tools array — getStateChanges', () => {
  it('includes getStateChanges tool definition', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name ===
        'getStateChanges'
    )
    assert.ok(def !== undefined)
  })

  it('includes framework parameter with react/redux enum', () => {
    const def = tools.find(
      t =>
        (t as { function: { name: string } }).function.name ===
        'getStateChanges'
    ) as {
      function: {
        parameters: { properties: Record<string, { enum?: string[] }> }
      }
    }
    assert.ok(def !== undefined)
    assert.deepStrictEqual(
      def.function.parameters.properties['framework']!.enum,
      ['react', 'redux']
    )
  })
})

// ─── Basic functionality ──────────────────────────────────────────────────────

describe('executeTool — getStateChanges — basic', () => {
  it('returns empty events for empty recording', async () => {
    const accessor = makeEmptyAccessor()
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as { events: unknown[]; total: number; _tokenEstimate: number }
    assert.deepStrictEqual(result.events, [])
    assert.strictEqual(result.total, 0)
    assert.ok(typeof result._tokenEstimate === 'number')
  })

  it('returns React commit event with expected fields', async () => {
    const events = [
      makeReactCommitEvent(100, 'MyButton', '{"text":"click me"}', '{}'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as {
      events: Array<{
        time: number
        framework: string
        eventType: string
        componentName: string
        propsDelta: string
      }>
      total: number
    }
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.events[0]!.time, 100)
    assert.strictEqual(result.events[0]!.framework, 'react')
    assert.strictEqual(result.events[0]!.eventType, 'ReactCommit')
    assert.strictEqual(result.events[0]!.componentName, 'MyButton')
    assert.strictEqual(result.events[0]!.propsDelta, '{"text":"click me"}')
    assert.strictEqual(result.total, 1)
  })

  it('returns Redux dispatch event with expected fields', async () => {
    const events = [
      makeReduxDispatchEvent(
        200,
        'user/login',
        '{"username":"alice"}',
        '{"loggedIn":true}'
      ),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as {
      events: Array<{
        time: number
        framework: string
        eventType: string
        actionType: string
        actionPayload: string
        stateDiff: string
      }>
    }
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.events[0]!.time, 200)
    assert.strictEqual(result.events[0]!.framework, 'redux')
    assert.strictEqual(result.events[0]!.eventType, 'ReduxDispatch')
    assert.strictEqual(result.events[0]!.actionType, 'user/login')
    assert.strictEqual(result.events[0]!.actionPayload, '{"username":"alice"}')
    assert.strictEqual(result.events[0]!.stateDiff, '{"loggedIn":true}')
  })

  it('returns multiple events in order', async () => {
    const events = [
      makeReactCommitEvent(100, 'Header'),
      makeReduxDispatchEvent(200, 'FETCH_DATA'),
      makeReactCommitEvent(300, 'Footer'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as { events: Array<{ time: number }>; total: number }
    assert.strictEqual(result.events.length, 3)
    assert.strictEqual(result.total, 3)
    assert.strictEqual(result.events[0]!.time, 100)
    assert.strictEqual(result.events[1]!.time, 200)
    assert.strictEqual(result.events[2]!.time, 300)
  })

  it('always includes _tokenEstimate', async () => {
    const accessor = makeEmptyAccessor()
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as { _tokenEstimate: number }
    assert.ok(typeof result._tokenEstimate === 'number')
    assert.ok(result._tokenEstimate >= 0)
  })
})

// ─── Filtering by componentName ───────────────────────────────────────────────

describe('executeTool — getStateChanges — componentName filter', () => {
  it('filters React commits by componentName substring match', async () => {
    const events = [
      makeReactCommitEvent(100, 'MyButton'),
      makeReactCommitEvent(200, 'UserProfile'),
      makeReactCommitEvent(300, 'MyInput'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { componentName: 'My' })
    )) as { events: Array<{ componentName: string }>; total: number }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.componentName.includes('My')))
  })

  it('componentName filter does not affect Redux dispatch events', async () => {
    const events = [
      makeReactCommitEvent(100, 'MyButton'),
      makeReduxDispatchEvent(200, 'FETCH_DATA'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { componentName: 'My' })
    )) as { events: Array<{ framework: string }> }
    // Redux events don't have componentName, so they pass through unchanged
    assert.strictEqual(result.events.length, 2)
  })

  it('returns _hint when componentName filter yields zero results', async () => {
    const events = [makeReactCommitEvent(100, 'MyButton')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {
        componentName: 'NonExistent',
      })
    )) as { events: unknown[]; _hint?: string }
    assert.strictEqual(result.events.length, 0)
    assert.ok(result._hint)
    assert.ok(result._hint.includes('getStateChanges'))
  })
})

// ─── Filtering by actionType ──────────────────────────────────────────────────

describe('executeTool — getStateChanges — actionType filter', () => {
  it('filters Redux dispatches by actionType substring match', async () => {
    const events = [
      makeReduxDispatchEvent(100, 'user/login'),
      makeReduxDispatchEvent(200, 'user/logout'),
      makeReduxDispatchEvent(300, 'product/fetch'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { actionType: 'user/' })
    )) as { events: Array<{ actionType: string }>; total: number }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.actionType.includes('user/')))
  })

  it('actionType filter does not affect React commit events', async () => {
    const events = [
      makeReactCommitEvent(100, 'MyButton'),
      makeReduxDispatchEvent(200, 'user/login'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { actionType: 'user/' })
    )) as { events: Array<{ framework: string }> }
    // React events don't have actionType, so they pass through unchanged
    assert.strictEqual(result.events.length, 2)
  })

  it('returns _hint when actionType filter yields zero results', async () => {
    const events = [makeReduxDispatchEvent(100, 'user/login')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { actionType: 'NONEXISTENT' })
    )) as { events: unknown[]; _hint?: string }
    assert.strictEqual(result.events.length, 0)
    assert.ok(result._hint)
    assert.ok(result._hint.includes('getStateChanges'))
  })
})

// ─── Framework filter ─────────────────────────────────────────────────────────

describe('executeTool — getStateChanges — framework filter', () => {
  it('framework=react returns only React commit events', async () => {
    const events = [
      makeReactCommitEvent(100, 'MyButton'),
      makeReduxDispatchEvent(200, 'FETCH_DATA'),
      makeReactCommitEvent(300, 'MyInput'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'react' })
    )) as { events: Array<{ framework: string }>; total: number }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.framework === 'react'))
  })

  it('framework=redux returns only Redux dispatch events', async () => {
    const events = [
      makeReactCommitEvent(100, 'MyButton'),
      makeReduxDispatchEvent(200, 'FETCH_DATA'),
      makeReduxDispatchEvent(300, 'SET_USER'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'redux' })
    )) as { events: Array<{ framework: string }>; total: number }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.framework === 'redux'))
  })

  it('framework=redux includes vuex/pinia events', async () => {
    const events = [
      makeReduxDispatchEvent(100, 'FETCH_DATA'),
      makeVuexMutationEvent(200, 'SET_USER'),
      makeReactCommitEvent(300, 'MyButton'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'redux' })
    )) as { events: Array<{ framework: string }>; total: number }
    // VuexMutation is also treated as redux framework
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.framework === 'redux'))
  })

  it('returns _hint when framework filter yields zero results', async () => {
    const events = [makeReactCommitEvent(100, 'MyButton')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'redux' })
    )) as { events: unknown[]; _hint?: string }
    assert.strictEqual(result.events.length, 0)
    assert.ok(result._hint)
    assert.ok(result._hint.includes('getStateChanges'))
  })
})

// ─── Time range filtering ─────────────────────────────────────────────────────

describe('executeTool — getStateChanges — time range filtering', () => {
  it('filters by timeRangeStartMs', async () => {
    const events = [
      makeReactCommitEvent(100, 'Early'),
      makeReactCommitEvent(500, 'Late'),
      makeReduxDispatchEvent(800, 'LATE_ACTION'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { timeRangeStartMs: 400 })
    )) as { events: Array<{ time: number }> }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.time >= 400))
  })

  it('filters by timeRangeEndMs', async () => {
    const events = [
      makeReactCommitEvent(100, 'Early'),
      makeReactCommitEvent(500, 'Middle'),
      makeReduxDispatchEvent(900, 'Late'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { timeRangeEndMs: 600 })
    )) as { events: Array<{ time: number }> }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.time <= 600))
  })

  it('filters by both timeRangeStartMs and timeRangeEndMs', async () => {
    const events = [
      makeReactCommitEvent(100, 'TooEarly'),
      makeReactCommitEvent(500, 'InRange'),
      makeReduxDispatchEvent(600, 'InRange'),
      makeReactCommitEvent(900, 'TooLate'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {
        timeRangeStartMs: 400,
        timeRangeEndMs: 700,
      })
    )) as { events: Array<{ time: number }> }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.time >= 400 && e.time <= 700))
  })
})

// ─── Limit ────────────────────────────────────────────────────────────────────

describe('executeTool — getStateChanges — limit', () => {
  it('respects limit parameter', async () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeReactCommitEvent(i * 100, `Component${i}`)
    )
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { limit: 3 })
    )) as { events: unknown[]; total: number }
    assert.strictEqual(result.events.length, 3)
    assert.strictEqual(result.total, 10)
  })

  it('uses default limit of 50', async () => {
    const events = Array.from({ length: 60 }, (_, i) =>
      makeReactCommitEvent(i * 100, `Component${i}`)
    )
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as { events: unknown[]; total: number }
    assert.strictEqual(result.events.length, 50)
    assert.strictEqual(result.total, 60)
  })
})

// ─── Empty results _hint ──────────────────────────────────────────────────────

describe('executeTool — getStateChanges — empty results', () => {
  it('returns _hint when no events found and no filters applied', async () => {
    const accessor = makeEmptyAccessor()
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as { events: unknown[]; _hint?: string }
    assert.strictEqual(result.events.length, 0)
    // _hint for completely empty recording
    assert.ok(result._hint)
    assert.ok(
      result._hint.includes('getStateChanges') || result._hint.includes('state')
    )
  })

  it('returns _hint mentioning getStateChanges when framework filter yields no results', async () => {
    const accessor = makeEmptyAccessor()
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'react' })
    )) as { events: unknown[]; _hint?: string }
    assert.strictEqual(result.events.length, 0)
    assert.ok(result._hint)
  })
})

// ─── Large JSON value truncation ──────────────────────────────────────────────

describe('executeTool — getStateChanges — value truncation', () => {
  it('truncates propsDelta values larger than 5 KB', async () => {
    const largeDelta = JSON.stringify({ data: 'x'.repeat(6000) })
    const events = [makeReactCommitEvent(100, 'MyComponent', largeDelta)]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as {
      events: Array<{ propsDelta: string }>
    }
    assert.ok(result.events[0]!.propsDelta.length <= 5200) // 5 KB + note overhead
    assert.ok(result.events[0]!.propsDelta.includes('[truncated'))
  })

  it('truncates stateDiff values larger than 5 KB', async () => {
    const largeDiff = JSON.stringify({ state: 'y'.repeat(6000) })
    const events = [makeReduxDispatchEvent(100, 'BIG_ACTION', '{}', largeDiff)]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as {
      events: Array<{ stateDiff: string }>
    }
    assert.ok(result.events[0]!.stateDiff.length <= 5200)
    assert.ok(result.events[0]!.stateDiff.includes('[truncated'))
  })
})

// ─── Framework validation ─────────────────────────────────────────────────────

describe('executeTool — getStateChanges — framework validation', () => {
  it('returns error with self-healing suggestion for unknown framework', async () => {
    const accessor = makeEmptyAccessor()
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'angular' })
    )) as { error: string; reason?: string; suggestion?: string }
    assert.ok(typeof result.error === 'string')
    assert.ok(result.error.includes('angular'))
    assert.ok(result.reason !== undefined)
    assert.ok(result.reason!.includes('react'))
    assert.ok(result.reason!.includes('redux'))
    assert.ok(result.suggestion !== undefined)
    assert.ok(result.suggestion!.includes('getStateChanges'))
  })

  it('accepts valid framework=react without error', async () => {
    const accessor = makeEmptyAccessor()
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'react' })
    )) as { error?: string; events?: unknown[] }
    assert.ok(result.error === undefined)
    assert.ok(Array.isArray(result.events))
  })

  it('accepts valid framework=redux without error', async () => {
    const accessor = makeEmptyAccessor()
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'redux' })
    )) as { error?: string; events?: unknown[] }
    assert.ok(result.error === undefined)
    assert.ok(Array.isArray(result.events))
  })
})

// ─── Limit clamping ───────────────────────────────────────────────────────────

describe('executeTool — getStateChanges — limit clamping', () => {
  it('clamps limit=0 to 1 to prevent empty results', async () => {
    const events = [
      makeReactCommitEvent(100, 'Component'),
      makeReactCommitEvent(200, 'Component2'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { limit: 0 })
    )) as { events: unknown[]; total: number }
    // With limit clamped to 1, we get at least 1 result, not 0
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.total, 2)
  })

  it('clamps negative limit to 1', async () => {
    const events = [makeReactCommitEvent(100, 'Component')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { limit: -10 })
    )) as { events: unknown[]; total: number }
    assert.strictEqual(result.events.length, 1)
  })
})

// ─── Vue/Vuex/Pinia coverage ──────────────────────────────────────────────────

describe('executeTool — getStateChanges — Vue/Vuex/Pinia events', () => {
  it('returns VueComponentUpdate event with expected fields', async () => {
    const events = [
      makeVueComponentUpdateEvent(
        100,
        'MyVueButton',
        42,
        '{"label":"click"}',
        '{}'
      ),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as {
      events: Array<{
        time: number
        framework: string
        eventType: string
        componentName: string
        uid: number
        propsDelta: string
        setupStateDelta: string
      }>
      total: number
    }
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.events[0]!.time, 100)
    assert.strictEqual(result.events[0]!.framework, 'react')
    assert.strictEqual(result.events[0]!.eventType, 'VueComponentUpdate')
    assert.strictEqual(result.events[0]!.componentName, 'MyVueButton')
    assert.strictEqual(result.events[0]!.uid, 42)
    assert.strictEqual(result.events[0]!.propsDelta, '{"label":"click"}')
  })

  it('framework=react includes VueComponentUpdate events', async () => {
    const events = [
      makeReactCommitEvent(100, 'ReactComponent'),
      makeVueComponentUpdateEvent(200, 'VueComponent'),
      makeReduxDispatchEvent(300, 'SOME_ACTION'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'react' })
    )) as {
      events: Array<{ framework: string; eventType: string }>
      total: number
    }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.framework === 'react'))
    const types = result.events.map(e => e.eventType)
    assert.ok(types.includes('ReactCommit'))
    assert.ok(types.includes('VueComponentUpdate'))
  })

  it('framework=redux excludes VueComponentUpdate events', async () => {
    const events = [
      makeVueComponentUpdateEvent(100, 'VueComponent'),
      makeReduxDispatchEvent(200, 'SOME_ACTION'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'redux' })
    )) as { events: Array<{ eventType: string }>; total: number }
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.events[0]!.eventType, 'ReduxDispatch')
  })

  it('returns VuexAction event with expected fields', async () => {
    const events = [
      makeVuexActionEvent(150, 'user/fetchProfile', '{"userId":1}'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as {
      events: Array<{
        time: number
        framework: string
        eventType: string
        actionType: string
        payload: string
      }>
    }
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.events[0]!.time, 150)
    assert.strictEqual(result.events[0]!.framework, 'redux')
    assert.strictEqual(result.events[0]!.eventType, 'VuexAction')
    assert.strictEqual(result.events[0]!.actionType, 'user/fetchProfile')
    assert.strictEqual(result.events[0]!.payload, '{"userId":1}')
  })

  it('actionType filter works for VuexAction events', async () => {
    const events = [
      makeVuexActionEvent(100, 'user/login'),
      makeVuexActionEvent(200, 'user/logout'),
      makeVuexActionEvent(300, 'product/fetch'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { actionType: 'user/' })
    )) as { events: Array<{ actionType: string }>; total: number }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.actionType.includes('user/')))
  })

  it('returns PiniaAction event with expected fields', async () => {
    const events = [
      makePiniaActionEvent(
        250,
        'cartStore',
        'addItem',
        '["itemId"]',
        '{"count":1}'
      ),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', {})
    )) as {
      events: Array<{
        time: number
        framework: string
        eventType: string
        storeId: string
        actionName: string
        args: string
        stateDiff: string
      }>
    }
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.events[0]!.time, 250)
    assert.strictEqual(result.events[0]!.framework, 'redux')
    assert.strictEqual(result.events[0]!.eventType, 'PiniaAction')
    assert.strictEqual(result.events[0]!.storeId, 'cartStore')
    assert.strictEqual(result.events[0]!.actionName, 'addItem')
  })

  it('actionType filter works for PiniaAction events via actionName', async () => {
    const events = [
      makePiniaActionEvent(100, 'cartStore', 'addItem'),
      makePiniaActionEvent(200, 'cartStore', 'removeItem'),
      makePiniaActionEvent(300, 'userStore', 'login'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { actionType: 'Item' })
    )) as { events: Array<{ actionName: string }>; total: number }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.actionName.includes('Item')))
  })

  it('framework=redux includes VuexAction and PiniaAction events', async () => {
    const events = [
      makeReactCommitEvent(100, 'ReactComp'),
      makeVuexActionEvent(200, 'store/action'),
      makePiniaActionEvent(300, 'myStore', 'doSomething'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getStateChanges', { framework: 'redux' })
    )) as {
      events: Array<{ framework: string; eventType: string }>
      total: number
    }
    assert.strictEqual(result.events.length, 2)
    assert.ok(result.events.every(e => e.framework === 'redux'))
    const types = result.events.map(e => e.eventType)
    assert.ok(types.includes('VuexAction'))
    assert.ok(types.includes('PiniaAction'))
  })
})
