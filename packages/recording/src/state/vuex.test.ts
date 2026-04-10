import {
  SourceEventType,
  StateEventType,
  StateSourceEvent,
  VuexActionEvent,
  VuexMutationEvent,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createVuexObserver } from './vuex'

// Mock Vuex devtools hook -- mimics __VUE_DEVTOOLS_GLOBAL_HOOK__.on/off/emit
function createMockHook() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}

  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = []
      listeners[event]!.push(handler)
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners[event]) return
      listeners[event] = listeners[event]!.filter(
        (h: (...args: unknown[]) => void) => h !== handler
      )
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners[event] ?? []) {
        handler(...args)
      }
    },
    listenerCount(event: string) {
      return listeners[event]?.length ?? 0
    },
  }
}

type MockHook = ReturnType<typeof createMockHook>

function installHook(hook: MockHook) {
  ;(globalThis as Record<string, unknown>)['__VUE_DEVTOOLS_GLOBAL_HOOK__'] =
    hook
}

function removeHook() {
  delete (globalThis as Record<string, unknown>)['__VUE_DEVTOOLS_GLOBAL_HOOK__']
}

describe('createVuexObserver', () => {
  it('returns an ObserverLike with observe and disconnect methods', () => {
    const observer = createVuexObserver(() => {})
    assert.equal(typeof observer.observe, 'function')
    assert.equal(typeof observer.disconnect, 'function')
    removeHook()
  })

  it('does nothing when no hook is present', () => {
    removeHook()
    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    assert.doesNotThrow(() => observer.observe({} as Document, {} as never))
    assert.doesNotThrow(() => observer.disconnect())
    assert.equal(events.length, 0)
  })

  it('emits VuexMutationEvent with correct type and payload on vuex:mutation', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    hook.emit(
      'vuex:mutation',
      { type: 'SET_USER', payload: { id: 1 } },
      {
        user: { id: 1 },
      }
    )

    assert.equal(events.length, 1)
    const sourceEvent = events[0]!
    assert.equal(sourceEvent.type, SourceEventType.State)

    const inner = (sourceEvent.data as Box<VuexMutationEvent>).unwrap()
    assert.equal(inner.type, StateEventType.VuexMutation)
    assert.equal(inner.mutationType, 'SET_USER')
    // payload is JSON-serialised
    const payload = JSON.parse(inner.payload) as unknown
    assert.deepEqual(payload, { id: 1 })

    observer.disconnect()
    removeHook()
  })

  it('emits VuexActionEvent with correct type and payload on vuex:action', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    hook.emit('vuex:action', { type: 'fetchUser', payload: { userId: 42 } }, {})

    assert.equal(events.length, 1)
    const sourceEvent = events[0]!
    assert.equal(sourceEvent.type, SourceEventType.State)

    const inner = (sourceEvent.data as Box<VuexActionEvent>).unwrap()
    assert.equal(inner.type, StateEventType.VuexAction)
    assert.equal(inner.actionType, 'fetchUser')
    const payload = JSON.parse(inner.payload) as unknown
    assert.deepEqual(payload, { userId: 42 })

    observer.disconnect()
    removeHook()
  })

  it('includes stateDiff in VuexMutationEvent', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    // Emit two mutations so the observer has a pre-state to diff against
    hook.emit('vuex:mutation', { type: 'SET_COUNT', payload: 0 }, { count: 0 })
    hook.emit(
      'vuex:mutation',
      { type: 'INCREMENT', payload: undefined },
      {
        count: 1,
      }
    )

    const inner = (events[1]!.data as Box<VuexMutationEvent>).unwrap()
    // stateDiff should be non-empty JSON reflecting the count change
    assert.ok(
      inner.stateDiff.length > 0,
      `Expected non-empty stateDiff but got: ${inner.stateDiff}`
    )

    observer.disconnect()
    removeHook()
  })

  it('computes correct diff when state is mutated in-place (real Vuex behavior)', () => {
    // Regression test: Vuex state is a live reactive object mutated in-place.
    // The observer must deep-clone the state snapshot on each mutation so that
    // the next diff compares against a frozen copy, not the same live reference.
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    // Single live state object -- same reference passed every time, just like real Vuex
    const liveState = { count: 0, name: 'test' }

    // First mutation: count 0 -> 1
    liveState.count = 1
    hook.emit('vuex:mutation', { type: 'INCREMENT', payload: null }, liveState)

    // Second mutation on the SAME object: count 1 -> 2
    liveState.count = 2
    hook.emit('vuex:mutation', { type: 'INCREMENT', payload: null }, liveState)

    assert.equal(events.length, 2)

    // The second event's stateDiff must reflect count changing from 1 to 2.
    // If lastState were stored as a reference instead of a clone, both before
    // and after would be 2, producing an empty diff.
    const secondInner = (events[1]!.data as Box<VuexMutationEvent>).unwrap()
    const diff = JSON.parse(secondInner.stateDiff) as Record<string, unknown>
    assert.deepEqual(
      diff['count'],
      { before: 1, after: 2 },
      `Expected diff.count = {before:1, after:2}, got: ${JSON.stringify(
        diff['count']
      )}`
    )

    observer.disconnect()
    removeHook()
  })

  it('drops stateDiff when state diff exceeds 20 KB', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    // First mutation to establish baseline state
    hook.emit('vuex:mutation', { type: 'INIT', payload: null }, {})

    // Build a state with many keys to exceed 20 KB serialised diff
    const bigState: Record<string, unknown> = {}
    for (let i = 0; i < 1000; i++) {
      bigState[`key${i}`] = 'x'.repeat(30)
    }

    hook.emit(
      'vuex:mutation',
      { type: 'BIG_MUTATION', payload: null },
      bigState
    )

    const inner = (events[1]!.data as Box<VuexMutationEvent>).unwrap()
    // stateDiff should be truncated indicator, not the full diff
    assert.ok(
      inner.stateDiff === '[state diff truncated]' ||
        inner.stateDiff.length <= 20_000,
      `Expected truncated stateDiff but got: ${inner.stateDiff.slice(0, 100)}`
    )

    observer.disconnect()
    removeHook()
  })

  it('drops payload when payload exceeds 10 KB in VuexMutationEvent', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    // Build a payload that exceeds 10 KB when JSON-serialised
    const bigPayload = { data: 'x'.repeat(11_000) }
    hook.emit('vuex:mutation', { type: 'BIG_PAYLOAD', payload: bigPayload }, {})

    const inner = (events[0]!.data as Box<VuexMutationEvent>).unwrap()
    assert.ok(
      inner.payload === '[truncated]' || inner.payload.length <= 10_000,
      `Expected truncated payload but got length: ${inner.payload.length}`
    )

    observer.disconnect()
    removeHook()
  })

  it('drops payload when payload exceeds 10 KB in VuexActionEvent', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    const bigPayload = { data: 'x'.repeat(11_000) }
    hook.emit('vuex:action', { type: 'BIG_ACTION', payload: bigPayload }, {})

    const inner = (events[0]!.data as Box<VuexActionEvent>).unwrap()
    assert.ok(
      inner.payload === '[truncated]' || inner.payload.length <= 10_000,
      `Expected truncated payload but got length: ${inner.payload.length}`
    )

    observer.disconnect()
    removeHook()
  })

  it('removes listeners on disconnect', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    // Fire one event before disconnect
    hook.emit('vuex:mutation', { type: 'A', payload: null }, {})
    assert.equal(events.length, 1)

    observer.disconnect()

    // Fire event after disconnect -- should not be received
    hook.emit('vuex:mutation', { type: 'B', payload: null }, {})
    assert.equal(
      events.length,
      1,
      'No new events should be emitted after disconnect'
    )

    removeHook()
  })

  it('does not overwrite existing hook -- preserves prior listeners', () => {
    const hook = createMockHook()
    installHook(hook)

    let priorListenerCalled = false
    hook.on('vuex:mutation', () => {
      priorListenerCalled = true
    })

    const observer = createVuexObserver(() => {})
    observer.observe({} as Document, {} as never)

    // The hook object itself should be preserved (same reference)
    assert.equal(
      (globalThis as Record<string, unknown>)['__VUE_DEVTOOLS_GLOBAL_HOOK__'],
      hook
    )

    // Both the prior listener and the new one should fire
    hook.emit('vuex:mutation', { type: 'X', payload: null }, {})
    assert.ok(priorListenerCalled, 'Prior listener should still be called')

    observer.disconnect()
    removeHook()
  })

  it('coexists with other hook event listeners without removing them on disconnect', () => {
    const hook = createMockHook()
    installHook(hook)

    let otherListenerCalled = false
    const otherListener = () => {
      otherListenerCalled = true
    }
    hook.on('vuex:mutation', otherListener)

    const observer = createVuexObserver(() => {})
    observer.observe({} as Document, {} as never)
    observer.disconnect()

    // Other listener should still be present after our disconnect
    hook.emit('vuex:mutation', { type: 'X', payload: null }, {})
    assert.ok(
      otherListenerCalled,
      'Other listener should remain after our observer disconnects'
    )

    removeHook()
  })

  it('is idempotent -- calling observe twice does not double-register', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)
    observer.observe({} as Document, {} as never) // second call

    hook.emit('vuex:mutation', { type: 'X', payload: null }, {})
    // Should only emit one event, not two
    assert.equal(events.length, 1)

    observer.disconnect()
    removeHook()
  })

  it('handles null/undefined payload gracefully', () => {
    const hook = createMockHook()
    installHook(hook)

    const events: StateSourceEvent[] = []
    const observer = createVuexObserver(e => events.push(e))
    observer.observe({} as Document, {} as never)

    hook.emit('vuex:mutation', { type: 'RESET', payload: undefined }, {})
    hook.emit('vuex:action', { type: 'init', payload: null }, {})

    assert.equal(events.length, 2)

    const mutEvent = (events[0]!.data as Box<VuexMutationEvent>).unwrap()
    const actEvent = (events[1]!.data as Box<VuexActionEvent>).unwrap()
    // Should not throw; payload should be some serialised value
    assert.ok(typeof mutEvent.payload === 'string')
    assert.ok(typeof actEvent.payload === 'string')

    observer.disconnect()
    removeHook()
  })
})
