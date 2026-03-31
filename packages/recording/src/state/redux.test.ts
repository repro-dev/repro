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

// Minimal Redux store mock
interface MockStore {
  dispatch: (action: Record<string, unknown>) => Record<string, unknown>
  getState: () => Record<string, unknown>
  subscribe: () => () => void
}

function createMockStore(initialState: Record<string, unknown>): MockStore {
  let state = { ...initialState }
  const store: MockStore = {
    dispatch(action: Record<string, unknown>) {
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
    const payload = JSON.parse(inner.actionPayload) as Record<string, unknown>
    assert.equal(payload['count'], 42)
    assert.equal('type' in payload, false)
    // stateDiff should include 'count' key changed
    const diff = JSON.parse(inner.stateDiff) as Record<
      string,
      { before: unknown; after: unknown }
    >
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
})
