import {
  ReduxDispatchEvent,
  SourceEventType,
  StateEventType,
  StateSourceEvent,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { Box } from '@repro/tdl'

// Max characters for JSON-serialised state diff before truncation
const STATE_DIFF_MAX_CHARS = 20_000

// Max characters for JSON-serialised action payload
const ACTION_PAYLOAD_MAX_CHARS = 10_000

// Names of window globals to probe for a Redux store, in priority order
const REDUX_STORE_GLOBALS: ReadonlyArray<string> = [
  'store',
  '__redux_store__',
  '__store',
  '__redux',
]

type ReduxAction = { type?: unknown; [key: string]: unknown }

interface ReduxStore {
  dispatch: (action: ReduxAction) => unknown
  getState: () => unknown
  subscribe: () => () => void
}

// Check whether a candidate object looks like a Redux store
function isReduxStore(candidate: unknown): candidate is ReduxStore {
  if (typeof candidate !== 'object' || candidate === null) return false
  const c = candidate as Record<string, unknown>
  return (
    typeof c['dispatch'] === 'function' &&
    typeof c['getState'] === 'function' &&
    typeof c['subscribe'] === 'function'
  )
}

// Find the first Redux store-shaped object from well-known window globals
function findReduxStore(
  win: Window & typeof globalThis
): ReduxStore | undefined {
  for (const key of REDUX_STORE_GLOBALS) {
    const candidate = (win as unknown as Record<string, unknown>)[key]
    if (isReduxStore(candidate)) {
      return candidate
    }
  }
  return undefined
}

// Serialise value to JSON string, replacing non-serialisable values with
// descriptive placeholders. Returns "[truncated]" if the result exceeds
// maxChars, or "[serialization error]" on any unexpected error.
function safeSerialize(value: unknown, maxChars: number): string {
  try {
    const json = JSON.stringify(value, (_key, val) => {
      if (typeof val === 'function') return '[function]'
      if (typeof val === 'bigint') return val.toString()
      // Attempt to catch non-serialisable objects (e.g. circular refs handled
      // by the try/catch; undefined is serialised as null by JSON.stringify)
      return val
    })
    if (json === undefined) return '[serialization error]'
    if (json.length > maxChars) return '[truncated]'
    return json
  } catch {
    return '[serialization error]'
  }
}

// Compute a shallow diff of two state objects — only top-level keys that
// changed (via Object.is) are included. Guards the output at STATE_DIFF_MAX_CHARS
// characters; returns "[state diff truncated]" if exceeded.
function computeStateDiff(before: unknown, after: unknown): string {
  if (typeof before !== 'object' || before == null) return '{}'
  if (typeof after !== 'object' || after == null) return '{}'

  const b = before as Record<string, unknown>
  const a = after as Record<string, unknown>
  const keys = new Set([...Object.keys(b), ...Object.keys(a)])
  const diff: Record<string, { before: unknown; after: unknown }> = {}

  for (const key of keys) {
    if (!Object.is(b[key], a[key])) {
      diff[key] = { before: b[key], after: a[key] }
    }
  }

  const serialised = safeSerialize(diff, STATE_DIFF_MAX_CHARS)
  if (serialised === '[truncated]') return '[state diff truncated]'
  return serialised
}

// Module-level store reference, populated by createReduxObserver().observe()
let currentStore: ReduxStore | undefined
let originalDispatch: ((action: ReduxAction) => unknown) | undefined

export function createReduxObserver(
  subscriber: (event: StateSourceEvent) => void,
  // Accept an optional window reference so tests can inject a mock
  win: Window & typeof globalThis = globalThis as Window & typeof globalThis
): ObserverLike {
  return {
    observe() {
      currentStore = findReduxStore(win)
      if (!currentStore) return

      const foundStore = currentStore
      originalDispatch = foundStore.dispatch

      foundStore.dispatch = function (action: ReduxAction) {
        const stateBefore = foundStore.getState()
        // eslint-disable-next-line no-invalid-this
        const result = originalDispatch!.call(this, action)
        const stateAfter = foundStore.getState()

        const actionType =
          typeof action['type'] === 'string' ? action['type'] : '[unknown]'

        // actionPayload: action without the 'type' field
        const { type: _type, ...payload } = action
        const actionPayload = safeSerialize(payload, ACTION_PAYLOAD_MAX_CHARS)

        const stateDiff = computeStateDiff(stateBefore, stateAfter)

        const inner: ReduxDispatchEvent = {
          type: StateEventType.ReduxDispatch,
          time: Date.now(),
          frameId: 0,
          actionType,
          actionPayload,
          stateDiff,
        }

        const event: StateSourceEvent = {
          type: SourceEventType.State,
          time: inner.time,
          data: new Box(inner),
        }

        subscriber(event)

        return result
      }
    },

    disconnect() {
      if (currentStore && originalDispatch) {
        currentStore.dispatch = originalDispatch
        currentStore = undefined
        originalDispatch = undefined
      }
    },
  }
}

// Returns the current Redux store state, or null if no store was found.
// Called at snapshot emit time by createRecordingStream.
export function getStoreState(): unknown {
  return currentStore ? currentStore.getState() : null
}
