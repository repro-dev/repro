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

// Well-known window globals to probe as fallback store detection
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

// Redux DevTools Extension window interface
export interface DevToolsMessage {
  type: string
  payload?: { type?: string; [key: string]: unknown }
  state?: string // JSON-serialised full Redux state at time of message
}

export interface DevToolsConnection {
  subscribe: (listener: (message: DevToolsMessage) => void) => () => void
  unsubscribe: () => void
}

export interface ReduxDevToolsExtension {
  connect: (options?: { name?: string }) => DevToolsConnection
}

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

function getDevToolsExtension(
  win: Window & typeof globalThis
): ReduxDevToolsExtension | undefined {
  const ext = (win as unknown as Record<string, unknown>)[
    '__REDUX_DEVTOOLS_EXTENSION__'
  ]
  if (
    typeof ext === 'object' &&
    ext !== null &&
    typeof (ext as Record<string, unknown>)['connect'] === 'function'
  ) {
    return ext as ReduxDevToolsExtension
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

function emitEvent(
  subscriber: (event: StateSourceEvent) => void,
  actionType: string,
  actionPayload: string,
  stateDiff: string
) {
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
}

export function createReduxObserver(
  subscriber: (event: StateSourceEvent) => void,
  // Accept an optional window reference so tests can inject a mock
  win: Window & typeof globalThis = globalThis as Window & typeof globalThis
): ObserverLike {
  // DevTools extension path
  let devToolsConnection: DevToolsConnection | undefined
  let devToolsUnsubscribe: (() => void) | undefined
  let previousDevToolsState: unknown = undefined

  // Dispatch-patch fallback path
  let store: ReduxStore | undefined
  let originalDispatch: ((action: ReduxAction) => unknown) | undefined

  return {
    observe() {
      // Tier 1: DevTools extension — preferred because it requires no global name guessing
      const ext = getDevToolsExtension(win)
      if (ext) {
        devToolsConnection = ext.connect({ name: 'Repro' })
        devToolsUnsubscribe = devToolsConnection.subscribe(message => {
          // Only handle DISPATCH messages (not RESET, IMPORT_STATE, etc.)
          if (message.type !== 'DISPATCH') return

          const actionType = message.payload?.type ?? '[unknown]'
          const stateJson = message.state
          let currentState: unknown = undefined
          if (stateJson) {
            try {
              currentState = JSON.parse(stateJson)
            } catch {
              currentState = undefined
            }
          }

          const stateDiff = computeStateDiff(
            previousDevToolsState,
            currentState
          )
          previousDevToolsState = currentState

          emitEvent(subscriber, actionType, '{}', stateDiff)
        })
        return
      }

      // Tier 2: dispatch-patch fallback for stores not using the DevTools extension
      store = findReduxStore(win)
      if (!store) return

      const foundStore = store
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

        emitEvent(subscriber, actionType, actionPayload, stateDiff)

        return result
      }
    },

    disconnect() {
      // Clean up DevTools connection
      if (devToolsUnsubscribe) {
        devToolsUnsubscribe()
        devToolsUnsubscribe = undefined
      }
      if (devToolsConnection) {
        devToolsConnection.unsubscribe()
        devToolsConnection = undefined
      }
      previousDevToolsState = undefined

      // Clean up dispatch patch
      if (store && originalDispatch) {
        store.dispatch = originalDispatch
        store = undefined
        originalDispatch = undefined
      }
    },
  }
}
