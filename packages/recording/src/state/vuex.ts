import {
  SourceEventType,
  StateEventType,
  StateSourceEvent,
  VuexActionEvent,
  VuexMutationEvent,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { Box } from '@repro/tdl'

// Max characters for JSON-serialised state diff before truncation
const STATE_DIFF_MAX_CHARS = 20_000

// Max characters for JSON-serialised mutation/action payload
const PAYLOAD_MAX_CHARS = 10_000

// The Vue devtools global hook shared by Vue 2, Vue 3, Vuex, and Pinia.
// Uses an event emitter API (on/off) rather than the React-style property wrapping.
interface VueDevToolsHook {
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
  emit?: (event: string, ...args: unknown[]) => void
  [key: string]: unknown
}

// Vuex mutation descriptor as emitted by Vuex 3/4 via the devtools hook
interface VuexMutation {
  type: string
  payload?: unknown
  [key: string]: unknown
}

// Vuex action descriptor as emitted by Vuex 3/4 via the devtools hook
interface VuexAction {
  type: string
  payload?: unknown
  [key: string]: unknown
}

// Serialise value to JSON string, replacing non-serialisable values with
// descriptive placeholders. Returns "[truncated]" if the result exceeds
// maxChars, or "[serialization error]" on any unexpected error.
function safeSerialize(value: unknown, maxChars: number): string {
  try {
    const json = JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === 'function') return '[function]'
      if (typeof val === 'bigint') return val.toString()
      return val
    })
    if (json === undefined) return '[serialization error]'
    if (json.length > maxChars) return '[truncated]'
    return json
  } catch {
    return '[serialization error]'
  }
}

// Compute a shallow diff of two state objects -- only top-level keys that
// changed (via Object.is) are included. Guards the output at STATE_DIFF_MAX_CHARS
// characters; returns "[state diff truncated]" if exceeded.
function computeStateDiff(before: unknown, after: unknown): string {
  if (typeof before !== 'object' || before == null) return '{}'
  if (typeof after !== 'object' || after == null) return '{}'

  const b = before as Record<string, unknown>
  const a = after as Record<string, unknown>
  const keys = new Set([...Object.keys(b), ...Object.keys(a)])
  const diff: Record<string, unknown> = {}

  for (const key of keys) {
    if (!Object.is(b[key], a[key])) {
      diff[key] = { before: b[key], after: a[key] }
    }
  }

  const serialised = safeSerialize(diff, STATE_DIFF_MAX_CHARS)
  if (serialised === '[truncated]') return '[state diff truncated]'
  return serialised
}

export function createVuexObserver(
  subscriber: (event: StateSourceEvent) => void
): ObserverLike {
  // Instance-scoped state -- no module-level singletons
  let isObserving = false
  // Deep-cloned snapshot of the last known Vuex state.
  // Vuex state is a live reactive object mutated in-place, so we must clone
  // it here -- storing the reference directly would cause every subsequent
  // diff to compare the object against itself, always returning '{}'.
  let lastState: unknown = null

  function handleMutation(mutation: unknown, state: unknown) {
    const m = mutation as VuexMutation
    const mutationType = typeof m.type === 'string' ? m.type : '[unknown]'

    const payload = safeSerialize(m.payload, PAYLOAD_MAX_CHARS)
    const stateDiff = computeStateDiff(lastState, state)

    // Deep-clone the current state so the next diff compares against a frozen
    // snapshot rather than the same live reference.
    try {
      lastState = JSON.parse(JSON.stringify(state))
    } catch {
      // Fallback for non-serialisable state (circular refs, etc.)
      lastState = state
    }

    const inner: VuexMutationEvent = {
      type: StateEventType.VuexMutation,
      time: performance.now(),
      frameId: 0,
      mutationType,
      payload,
      stateDiff,
    }

    const event: StateSourceEvent = {
      type: SourceEventType.State,
      time: inner.time,
      data: new Box<VuexMutationEvent>(inner),
    }

    subscriber(event)
  }

  function handleAction(action: unknown, _state: unknown) {
    const a = action as VuexAction
    const actionType = typeof a.type === 'string' ? a.type : '[unknown]'

    const payload = safeSerialize(a.payload, PAYLOAD_MAX_CHARS)

    const inner: VuexActionEvent = {
      type: StateEventType.VuexAction,
      time: performance.now(),
      frameId: 0,
      actionType,
      payload,
    }

    const event: StateSourceEvent = {
      type: SourceEventType.State,
      time: inner.time,
      data: new Box<VuexActionEvent>(inner),
    }

    subscriber(event)
  }

  return {
    observe() {
      // Idempotency: a second call must not double-register handlers
      if (isObserving) return

      const hook = (globalThis as Record<string, unknown>)[
        '__VUE_DEVTOOLS_GLOBAL_HOOK__'
      ] as VueDevToolsHook | undefined

      if (!hook) return

      // Use hook.on() to add our listeners without overwriting any existing ones
      hook.on('vuex:mutation', handleMutation)
      hook.on('vuex:action', handleAction)

      isObserving = true
    },

    disconnect() {
      if (!isObserving) return

      const hook = (globalThis as Record<string, unknown>)[
        '__VUE_DEVTOOLS_GLOBAL_HOOK__'
      ] as VueDevToolsHook | undefined

      if (hook) {
        hook.off('vuex:mutation', handleMutation)
        hook.off('vuex:action', handleAction)
      }

      isObserving = false
      lastState = null
    },
  }
}
