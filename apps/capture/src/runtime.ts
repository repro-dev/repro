import {
  LogLevel,
  MessagePartType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import {
  createNetworkObserver,
  createPerformanceObserver,
} from '@repro/recording'
import { Box } from '@repro/tdl'
import { appendRuntimeBuffer } from './runtimeBuffer'

type RuntimeInstalledType = 'console' | 'custom' | 'network' | 'performance'

type RuntimeReproExtension = {
  mark?: (name: string, data?: Record<string, unknown>) => void
  captureState?: (component: string, state: Record<string, unknown>) => void
  [key: string]: unknown
}

interface RuntimeHookListenerMap {
  [event: string]: Set<(...args: Array<unknown>) => void>
}

interface RuntimeHook {
  supportsFiber: true
  renderers: Map<number, unknown>
  inject(renderer: unknown): number
  on(event: string, listener: (...args: Array<unknown>) => void): void
  off(event: string, listener: (...args: Array<unknown>) => void): void
  emit(event: string, ...args: Array<unknown>): void
  isDisabled: boolean
  [key: string]: unknown
}

declare global {
  interface Window {
    __REPRO__?: RuntimeReproExtension
    __REPRO_RUNTIME_BUFFER__?: Array<DataView>
    __REPRO_RUNTIME_BUFFER_SINK__?: (event: DataView) => void
    __REPRO_RUNTIME_INSTALLED__?: boolean
    __REPRO_RUNTIME_INSTALLED_TYPES__?: Set<RuntimeInstalledType>
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: RuntimeHook
  }
}

const runtimeVTree = {
  rootId: '__repro_runtime__',
  nodes: {},
} as any

function getInstalledTypes() {
  window.__REPRO_RUNTIME_INSTALLED_TYPES__ ??= new Set()
  return window.__REPRO_RUNTIME_INSTALLED_TYPES__
}

function bufferSourceEvent(event: unknown) {
  const encodedEvent = SourceEventView.encode(new Box(event as never))
  const sink = window.__REPRO_RUNTIME_BUFFER_SINK__

  if (sink) {
    sink(encodedEvent)
    return
  }

  appendRuntimeBuffer(encodedEvent)
}

function safeSerialize(value: unknown) {
  if (value instanceof Error) {
    return value.stack ?? value.message
  }

  try {
    const json = JSON.stringify(value)
    return json === undefined ? String(value) : json
  } catch {
    return String(value)
  }
}

function createConsoleMessage(level: LogLevel, args: Array<unknown>) {
  return {
    time: performance.now(),
    type: SourceEventType.Console,
    data: {
      level,
      parts: args.map(value => {
        return new Box({
          type: MessagePartType.String,
          value: safeSerialize(value),
        })
      }),
      stack: [],
    },
  }
}

function installConsoleObserver() {
  const installedTypes = getInstalledTypes()

  if (installedTypes.has('console')) {
    return
  }

  const levels: Record<string, LogLevel | null> = {
    assert: null,
    clear: null,
    count: null,
    countReset: null,
    debug: LogLevel.Verbose,
    dir: LogLevel.Info,
    dirxml: LogLevel.Info,
    error: LogLevel.Error,
    group: null,
    groupCollapsed: null,
    groupEnd: null,
    info: LogLevel.Info,
    log: LogLevel.Info,
    table: LogLevel.Info,
    time: null,
    timeEnd: null,
    timeLog: null,
    trace: LogLevel.Error,
    warn: LogLevel.Warning,
    profile: null,
    profileEnd: null,
    timeStamp: null,
  }

  for (const [method, level] of Object.entries(levels)) {
    const original = (globalThis.console as unknown as Record<string, unknown>)[
      method
    ]

    if (typeof original !== 'function' || level === null) {
      continue
    }

    const bound = (original as (...args: Array<unknown>) => void).bind(console)

    Object.defineProperty(globalThis.console, method, {
      configurable: true,
      writable: true,
      value: ((...args: Array<unknown>) => {
        bound(...args)
        bufferSourceEvent(createConsoleMessage(level, args))
      }) as never,
    })
  }

  installedTypes.add('console')
}

function installNetworkObserver() {
  const installedTypes = getInstalledTypes()

  if (installedTypes.has('network')) {
    return
  }

  if (
    typeof globalThis.fetch !== 'function' ||
    typeof globalThis.XMLHttpRequest !== 'function' ||
    typeof globalThis.WebSocket !== 'function'
  ) {
    return
  }

  const observer = createNetworkObserver(message => {
    bufferSourceEvent({
      time: performance.now(),
      type: SourceEventType.Network,
      data: message,
    })
  })

  observer.observe(document, runtimeVTree)
  installedTypes.add('network')
}

function installPerformanceObserver() {
  const installedTypes = getInstalledTypes()

  if (installedTypes.has('performance')) {
    return
  }

  if (typeof globalThis.PerformanceObserver !== 'function') {
    return
  }

  const observer = createPerformanceObserver(entry => {
    bufferSourceEvent({
      time: performance.now(),
      type: SourceEventType.Performance,
      data: entry,
    })
  })

  observer.observe(document, runtimeVTree)
  installedTypes.add('performance')
}

function safeSerializeCustomMarkData(value: unknown) {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? String(value) : json
  } catch {
    return String(value)
  }
}

function createCustomMarkEvent(name: string, data?: Record<string, unknown>) {
  return {
    time: performance.now(),
    type: SourceEventType.CustomMark,
    data: {
      name,
      data: data ? safeSerializeCustomMarkData(data) : null,
      frameId: 0,
    },
  }
}

function installCustomMarkHook() {
  const installedTypes = getInstalledTypes()

  if (installedTypes.has('custom')) {
    return
  }

  const repro = (window.__REPRO__ ??= {})
  const previousMark = repro.mark?.bind(repro)

  repro.mark = (name: string, data?: Record<string, unknown>) => {
    previousMark?.call(repro, name, data)
    bufferSourceEvent(createCustomMarkEvent(name, data))
  }

  installedTypes.add('custom')
}

function createReactHookStub(): RuntimeHook {
  const listeners: RuntimeHookListenerMap = {}
  const renderers = new Map<number, unknown>()
  let nextRendererId = 0

  const hook: RuntimeHook = {
    supportsFiber: true,
    renderers,
    isDisabled: false,

    inject(renderer: unknown) {
      const rendererId = nextRendererId
      nextRendererId += 1
      renderers.set(rendererId, renderer)
      hook.emit('inject', rendererId, renderer)
      return rendererId
    },

    on(event: string, listener: (...args: Array<unknown>) => void) {
      listeners[event] ??= new Set()
      listeners[event].add(listener)
    },

    off(event: string, listener: (...args: Array<unknown>) => void) {
      listeners[event]?.delete(listener)
      if (listeners[event]?.size === 0) {
        delete listeners[event]
      }
    },

    emit(event: string, ...args: Array<unknown>) {
      listeners[event]?.forEach(listener => {
        listener(...args)
      })
    },
  }

  return hook
}

function installReactHookStub() {
  if (
    Object.prototype.hasOwnProperty.call(
      globalThis,
      '__REACT_DEVTOOLS_GLOBAL_HOOK__'
    )
  ) {
    return (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  }

  const hook = createReactHookStub()

  Object.defineProperty(globalThis, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: hook,
  })

  return hook
}

export function installRuntime() {
  if (window.__REPRO_RUNTIME_INSTALLED__) {
    return
  }

  window.__REPRO_RUNTIME_BUFFER__ ??= []
  getInstalledTypes()
  installReactHookStub()
  installCustomMarkHook()
  installNetworkObserver()
  installPerformanceObserver()
  installConsoleObserver()

  window.__REPRO_RUNTIME_INSTALLED__ = true
}

installRuntime()
