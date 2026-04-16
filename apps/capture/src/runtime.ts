/**
 * Headless recording runtime — safe to load at `document_start` in the MAIN
 * world before `document.head` exists.
 *
 * ZERO React / jsxstyle / rxjs / @repro/atom imports at evaluation time.
 * Network and performance patches are imported from leaf modules that have
 * no DOM side effects at module evaluation time. Console patches are inlined
 * to avoid the transitive @repro/tdl / @repro/vdom-utils chain.
 *
 * Captured events are buffered on `window.__REPRO_RUNTIME_BUFFER__` until the
 * full capture bundle drains them into the recording stream on `enable`.
 */

// These are deep imports into the workspace package, resolving via the pnpm
// symlink at node_modules/@repro/recording → ../../../../packages/recording.
// The imported modules have no DOM side effects at module evaluation time.
import { createNetworkObserver } from '@repro/recording/src/network/observe'
import { createPerformanceObserver } from '@repro/recording/src/performance/observe'

// ---------------------------------------------------------------------------
// Sentinel / buffer keys (keep in sync with the global augmentation below)
// ---------------------------------------------------------------------------

const BUFFER_KEY = '__REPRO_RUNTIME_BUFFER__'
const INSTALLED_KEY = '__REPRO_RUNTIME_INSTALLED__'
const INSTALLED_TYPES_KEY = '__REPRO_RUNTIME_INSTALLED_TYPES__'

// Global augmentation — optional because index.tsx may load without runtime.ts.
// Modifiers MUST match the declarations in index.tsx (both optional).
declare global {
  interface Window {
    __REPRO_RUNTIME_BUFFER__?: Array<unknown>
    __REPRO_RUNTIME_INSTALLED__?: boolean
    __REPRO_RUNTIME_INSTALLED_TYPES__?: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __REACT_DEVTOOLS_GLOBAL_HOOK__: any
  }
}

// Helper to access window globals without casting `globalThis` to the full
// Window interface (which triggers TS2352 because globalThis is too narrow).
const g = globalThis as unknown as Window

// Guard against double-execution (e.g. injected by both content script and page).
if (!g[INSTALLED_KEY]) {
  g[INSTALLED_KEY] = true

  // Initialise the pre-stream event buffer.
  g[BUFFER_KEY] = []

  // Non-null assertion is safe: we just initialised the buffer above.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const buffer: Array<unknown> = g[BUFFER_KEY]!
  const installedTypes: string[] = []
  g[INSTALLED_TYPES_KEY] = installedTypes

  // -------------------------------------------------------------------------
  // Network patches (fetch / XHR / WebSocket + MessageEvent.prototype.data)
  // -------------------------------------------------------------------------

  const networkObserver = createNetworkObserver(message => {
    buffer.push(message)
  })

  // `observe(doc, vtree)` args are forwarded only to MessageEvent observer
  // which also only patches MessageEvent.prototype. The XHR/fetch/WebSocket
  // proxies only touch globalThis — safe to call with null args at document_start.
  // @ts-expect-error: null args intentional — no DOM available at document_start
  networkObserver.observe(null, null)
  installedTypes.push('network')

  // -------------------------------------------------------------------------
  // Console patches (inlined — cannot safely import createConsoleObserver
  // because it transitively imports @repro/tdl Box and @repro/vdom-utils which
  // may have evaluation-time side effects or pull in heavy dependencies)
  // -------------------------------------------------------------------------

  const _log = console.log
  const _info = console.info
  const _warn = console.warn
  const _error = console.error
  const _debug = console.debug

  function patchConsoleMethod(
    level: string,
    original: (...args: unknown[]) => void
  ) {
    return new Proxy(original, {
      apply(target, thisArg, args: unknown[]) {
        Reflect.apply(target, thisArg, args)
        buffer.push({ __runtimeConsole: true, level, args, time: Date.now() })
      },
    })
  }

  console.log = patchConsoleMethod('info', _log)
  console.info = patchConsoleMethod('info', _info)
  console.warn = patchConsoleMethod('warning', _warn)
  console.error = patchConsoleMethod('error', _error)
  console.debug = patchConsoleMethod('verbose', _debug)

  function catchError(ev: ErrorEvent) {
    buffer.push({
      __runtimeConsole: true,
      level: 'error',
      args: [ev.message],
      time: Date.now(),
    })
  }

  window.addEventListener('error', catchError)
  installedTypes.push('console')

  // -------------------------------------------------------------------------
  // Performance observer (PerformanceObserver with buffered: true)
  // -------------------------------------------------------------------------

  const performanceObserver = createPerformanceObserver(entry => {
    buffer.push(entry)
  })

  // PerformanceObserver does not use doc/vtree arguments — safe with nulls.
  // @ts-expect-error: null args intentional — no DOM available at document_start
  performanceObserver.observe(null, null)
  installedTypes.push('performance')

  // -------------------------------------------------------------------------
  // React DevTools hook stub
  // Install only if not already present — React reads this at module load time.
  // -------------------------------------------------------------------------

  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false,
      supportsFiber: true,
      renderers: new Map(),
      _renderers: {},
      helpers: {},
      onCommitFiberRoot: () => undefined,
      onCommitFiberUnmount: () => undefined,
      inject: () => undefined,
    }
    installedTypes.push('state')
  }
}
