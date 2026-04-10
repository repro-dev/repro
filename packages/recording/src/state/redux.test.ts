import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ReduxDispatchEvent,
  SourceEventType,
  StateEventType,
  StateSourceEvent,
} from '@repro/domain'
import { Box } from '@repro/tdl'

import { createReduxObserver } from './redux'

type UnknownRecord = { [key: string]: unknown }
type StateDiffRecord = { [key: string]: { before: unknown; after: unknown } }

// Minimal Redux store mock
interface MockStore {
  dispatch: (action: UnknownRecord) => UnknownRecord
  getState: () => UnknownRecord
  subscribe: () => () => void
}

function createMockStore(initialState: UnknownRecord): MockStore {
  let state = { ...initialState }
  const store: MockStore = {
    dispatch(action: UnknownRecord) {
      // Simulate a reducer: merge action payload into state (excluding type)
      const { type: _type, ...payload } = action
      state = { ...state, ...payload }
      return action
    },
    getState() {
      return state
    },
    subscribe() {
      return () => {}
    },
  }
  return store
}

describe('createReduxObserver', () => {
  it('returns an ObserverLike with observe and disconnect', () => {
    const observer = createReduxObserver(() => {})
    assert.equal(typeof observer.observe, 'function')
    assert.equal(typeof observer.disconnect, 'function')
  })

  it('returns getStoreState method on the observer', () => {
    const observer = createReduxObserver(() => {})
    assert.equal(typeof observer.getStoreState, 'function')
  })

  it('does nothing when no Redux store found', () => {
    // Ensure window globals are absent
    const win = {} as Window & typeof globalThis
    const observer = createReduxObserver(() => {}, win)
    // Should not throw
    assert.doesNotThrow(() => observer.observe({} as Document, {} as never))
    assert.doesNotThrow(() => observer.disconnect())
  })

  it('detects store at window.store and wraps dispatch', () => {
    const store = createMockStore({ count: 0 })
    const originalDispatch = store.dispatch
    const win = { store } as unknown as Window & typeof globalThis

    const events: StateSourceEvent[] = []
    const observer = createReduxObserver(e => events.push(e), win)
    observer.observe({} as Document, {} as never)

    // dispatch should be wrapped
    assert.notEqual(store.dispatch, originalDispatch)
  })

  it('emits StateSourceEvent with correct type on dispatch', () => {
    const store = createMockStore({ count: 0 })
    const win = { store } as unknown as Window & typeof globalThis

    const events: StateSourceEvent[] = []
    const observer = createReduxObserver(e => events.push(e), win)
    observer.observe({} as Document, {} as never)

    store.dispatch({ type: 'INCREMENT' })

    assert.equal(events.length, 1)
    const event = events[0]!
    assert.equal(event.type, SourceEventType.State)
    assert.ok(event.data instanceof Box)
  })

  it('emits ReduxDispatchEvent with correct actionType, actionPayload, stateDiff', () => {
    const store = createMockStore({ count: 0, name: 'Alice' })
    const win = { store } as unknown as Window & typeof globalThis

    const events: StateSourceEvent[] = []
    const observer = createReduxObserver(e => events.push(e), win)
    observer.observe({} as Document, {} as never)

    store.dispatch({ type: 'SET_COUNT', count: 42 })

    assert.equal(events.length, 1)
    const inner = events[0]!.data
      .map((e): ReduxDispatchEvent => {
        assert.equal(e.type, StateEventType.ReduxDispatch)
        return e as ReduxDispatchEvent
      })
      .unwrap()

    assert.equal(inner.type, StateEventType.ReduxDispatch)
    assert.equal(inner.actionType, 'SET_COUNT')
    // actionPayload should exclude 'type', contain 'count'
    const payload = JSON.parse(inner.actionPayload) as UnknownRecord
    assert.equal(payload['count'], 42)
    assert.equal('type' in payload, false)
    // stateDiff should include 'count' key changed
    const diff = JSON.parse(inner.stateDiff) as StateDiffRecord
    assert.ok('count' in diff)
    assert.equal(diff['count']!.before, 0)
    assert.equal(diff['count']!.after, 42)
    // 'name' should not be in diff (unchanged)
    assert.equal('name' in diff, false)
  })

  it('restores original dispatch on disconnect', () => {
    const store = createMockStore({ count: 0 })
    const originalDispatch = store.dispatch
    const win = { store } as unknown as Window & typeof globalThis

    const observer = createReduxObserver(() => {}, win)
    observer.observe({} as Document, {} as never)

    assert.notEqual(store.dispatch, originalDispatch)

    observer.disconnect()

    assert.equal(store.dispatch, originalDispatch)
  })

  it('sets stateDiff to "[state diff truncated]" when output exceeds 20000 chars', () => {
    // Build a state where the diff would be large
    const bigValue = 'x'.repeat(25000)
    const store = createMockStore({ bigKey: '' })
    const win = { store } as unknown as Window & typeof globalThis

    const events: StateSourceEvent[] = []
    const observer = createReduxObserver(e => events.push(e), win)
    observer.observe({} as Document, {} as never)

    store.dispatch({ type: 'SET_BIG', bigKey: bigValue })

    assert.equal(events.length, 1)
    const inner = events[0]!.data
      .map((e): ReduxDispatchEvent => {
        return e as ReduxDispatchEvent
      })
      .unwrap()

    assert.equal(inner.stateDiff, '[state diff truncated]')
  })

  it('uses performance.now() for event timestamps (not epoch milliseconds)', () => {
    const store = createMockStore({ count: 0 })
    const win = { store } as unknown as Window & typeof globalThis

    const events: StateSourceEvent[] = []
    const observer = createReduxObserver(e => events.push(e), win)
    observer.observe({} as Document, {} as never)

    const before = performance.now()
    store.dispatch({ type: 'INC' })
    const after = performance.now()

    assert.equal(events.length, 1)
    const t = events[0]!.time
    // performance.now() values are in the range [0, ~process uptime in ms]
    // Date.now() values are ~1.7 trillion ms (epoch). A simple upper-bound check
    // of 1e9 (≈ 277 hours of uptime) distinguishes the two.
    assert.ok(t >= before, 'time should be >= before dispatch')
    assert.ok(t <= after, 'time should be <= after dispatch')
    assert.ok(t < 1e9, 'time should be a relative timestamp, not epoch ms')
  })
})

describe('getStoreState (instance method)', () => {
  it('returns null when no store has been observed', () => {
    // Use an empty window with no store globals
    const win = {} as Window & typeof globalThis
    const observer = createReduxObserver(() => {}, win)
    observer.observe({} as Document, {} as never)
    observer.disconnect()

    assert.equal(observer.getStoreState(), null)
  })

  it('returns current store state after observe', () => {
    const store = createMockStore({ count: 5, name: 'Test' })
    const win = { store } as unknown as Window & typeof globalThis

    const observer = createReduxObserver(() => {}, win)
    observer.observe({} as Document, {} as never)

    const state = observer.getStoreState() as UnknownRecord
    assert.equal(state['count'], 5)
    assert.equal(state['name'], 'Test')

    observer.disconnect()
  })

  it('returns null after disconnect', () => {
    const store = createMockStore({ x: 1 })
    const win = { store } as unknown as Window & typeof globalThis

    const observer = createReduxObserver(() => {}, win)
    observer.observe({} as Document, {} as never)

    // Confirm non-null while connected
    assert.notEqual(observer.getStoreState(), null)

    observer.disconnect()

    assert.equal(observer.getStoreState(), null)
  })

  it('reflects updated state after a dispatch', () => {
    const store = createMockStore({ count: 0 })
    const win = { store } as unknown as Window & typeof globalThis

    const observer = createReduxObserver(() => {}, win)
    observer.observe({} as Document, {} as never)

    store.dispatch({ type: 'INCREMENT', count: 42 })

    const state = observer.getStoreState() as UnknownRecord
    assert.equal(state['count'], 42)

    observer.disconnect()
  })

  it('two independent observers do not share state', () => {
    const store1 = createMockStore({ a: 1 })
    const store2 = createMockStore({ b: 2 })
    const win1 = { store: store1 } as unknown as Window & typeof globalThis
    const win2 = { store: store2 } as unknown as Window & typeof globalThis

    const obs1 = createReduxObserver(() => {}, win1)
    const obs2 = createReduxObserver(() => {}, win2)

    obs1.observe({} as Document, {} as never)
    obs2.observe({} as Document, {} as never)

    const s1 = obs1.getStoreState() as UnknownRecord
    const s2 = obs2.getStoreState() as UnknownRecord

    assert.equal(s1['a'], 1)
    assert.equal('b' in s1, false)
    assert.equal(s2['b'], 2)
    assert.equal('a' in s2, false)

    obs1.disconnect()
    obs2.disconnect()
  })
})

describe('idempotency', () => {
  it('calling observe() twice does not stack dispatch wrappers', () => {
    const store = createMockStore({ count: 0 })
    const originalDispatch = store.dispatch
    const win = { store } as unknown as Window & typeof globalThis

    const events: StateSourceEvent[] = []
    const observer = createReduxObserver(e => events.push(e), win)

    // Call observe twice
    observer.observe({} as Document, {} as never)
    observer.observe({} as Document, {} as never)

    // Dispatch should only be wrapped once — not double-wrapped
    store.dispatch({ type: 'INC' })

    // Only one event should be emitted per dispatch
    assert.equal(events.length, 1)

    observer.disconnect()

    // Original dispatch should be fully restored
    assert.equal(store.dispatch, originalDispatch)
  })

  it('calling observe() multiple times does not cause double events on dispatch', () => {
    const store = createMockStore({ count: 0 })
    const win = { store } as unknown as Window & typeof globalThis

    const events: StateSourceEvent[] = []
    const observer = createReduxObserver(e => events.push(e), win)

    observer.observe({} as Document, {} as never)
    observer.observe({} as Document, {} as never)
    observer.observe({} as Document, {} as never)

    store.dispatch({ type: 'INC' })

    // Regardless of how many times observe was called, exactly one event per dispatch
    assert.equal(events.length, 1)

    observer.disconnect()
  })

  it('disconnect fully restores original dispatch after multiple observe calls', () => {
    const store = createMockStore({ count: 0 })
    const originalDispatch = store.dispatch
    const win = { store } as unknown as Window & typeof globalThis

    const observer = createReduxObserver(() => {}, win)

    observer.observe({} as Document, {} as never)
    observer.observe({} as Document, {} as never)

    observer.disconnect()

    // Must restore exactly the original, not an intermediate wrapper
    assert.equal(store.dispatch, originalDispatch)
  })
})

describe('session reset', () => {
  it('getStoreState returns null between disconnect and re-observe', () => {
    const store = createMockStore({ count: 1 })
    const win = { store } as unknown as Window & typeof globalThis

    const observer = createReduxObserver(() => {}, win)
    observer.observe({} as Document, {} as never)

    // While connected, getStoreState returns state
    assert.notEqual(observer.getStoreState(), null)

    observer.disconnect()

    // After disconnect, getStoreState should return null
    assert.equal(observer.getStoreState(), null)

    // Re-observe picks up the store again
    observer.observe({} as Document, {} as never)
    const state = observer.getStoreState() as UnknownRecord
    assert.equal(state['count'], 1)

    observer.disconnect()
  })

  it('after disconnect(), re-observe() picks up fresh store state', () => {
    const store = createMockStore({ session: 'first' })
    const win = { store } as unknown as Window & typeof globalThis

    const observer = createReduxObserver(() => {}, win)
    observer.observe({} as Document, {} as never)

    store.dispatch({ type: 'UPDATE', session: 'updated' })
    observer.disconnect()

    // Simulate a new session: re-observe against the same store
    // The observer should reflect the current (updated) state, not stale prior state
    observer.observe({} as Document, {} as never)

    const state = observer.getStoreState() as UnknownRecord
    assert.equal(state['session'], 'updated')

    observer.disconnect()
  })

  it('resetStoreState restores original dispatch and clears cached store reference', () => {
    const store = createMockStore({ count: 99 })
    const originalDispatch = store.dispatch
    const win = { store } as unknown as Window & typeof globalThis

    const observer = createReduxObserver(() => {}, win)
    observer.observe({} as Document, {} as never)

    // Confirm store is accessible
    assert.notEqual(observer.getStoreState(), null)
    assert.notEqual(store.dispatch, originalDispatch)

    // resetStoreState should fully tear down observer state
    observer.resetStoreState()

    assert.equal(store.dispatch, originalDispatch)
    assert.equal(observer.getStoreState(), null)
  })

  it('resetStoreState allows re-observe without stacking dispatch wrappers', () => {
    const store = createMockStore({ count: 0 })
    const originalDispatch = store.dispatch
    const win = { store } as unknown as Window & typeof globalThis

    const events: StateSourceEvent[] = []
    const observer = createReduxObserver(e => events.push(e), win)
    observer.observe({} as Document, {} as never)

    observer.resetStoreState()
    assert.equal(store.dispatch, originalDispatch)

    observer.observe({} as Document, {} as never)
    store.dispatch({ type: 'INC', count: 1 })

    assert.equal(events.length, 1)

    observer.disconnect()
    assert.equal(store.dispatch, originalDispatch)
  })
})
