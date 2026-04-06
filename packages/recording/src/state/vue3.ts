import { StateEventType, VTree, VueComponentUpdateEvent } from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'

// Max serialised delta size in characters (10 KB)
const MAX_DELTA_SIZE = 10_000

// Max depth for safe serialisation
const MAX_SERIALISE_DEPTH = 3

// Vue 3 built-in component names to skip
const VUE_BUILTINS = new Set([
  'Transition',
  'TransitionGroup',
  'KeepAlive',
  'Suspense',
  'Teleport',
])

// Minimal interface for Vue 3's ComponentInternalInstance
interface ComponentInternalInstance {
  uid: number
  type: {
    name?: string
    __name?: string
    __file?: string
    [key: string]: unknown
  }
  setupState: Record<string, unknown>
  props: Record<string, unknown>
  attrs?: Record<string, unknown>
  parent?: ComponentInternalInstance | null
  [key: string]: unknown
}

// Minimal interface for the Vue 3 devtools global hook
interface Vue3DevToolsHook {
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
  [key: string]: unknown
}

// Resolve the component display name from a Vue 3 type descriptor.
// Priority: name -> __name -> basename of __file (without extension) -> null
function getComponentName(instance: ComponentInternalInstance): string | null {
  const { type } = instance
  if (type.name) return type.name
  if (type.__name) return type.__name
  if (type.__file) {
    // Extract basename without extension: '/src/Foo.vue' -> 'Foo'
    const base = type.__file.replace(/\\/g, '/').split('/').pop() ?? ''
    return base.replace(/\.\w+$/, '') || null
  }
  return null
}

// Returns true for Vue's built-in internal components that should not be tracked
function isVueBuiltin(name: string): boolean {
  return VUE_BUILTINS.has(name)
}

// Safe JSON serialiser with depth limit, circular ref guard, and type coercion.
// Returns '{}' on any error, matching the react.ts pattern.
function safeSerialise(value: unknown): string {
  try {
    const seen = new Set()

    function replacer(val: unknown, depth: number): unknown {
      if (depth > MAX_SERIALISE_DEPTH) return '[object ...]'
      if (typeof val === 'function') return '[function]'
      if (val === null || typeof val !== 'object') return val

      if (seen.has(val)) return '[circular]'
      seen.add(val)

      const proto = Object.getPrototypeOf(val)
      if (proto !== Object.prototype && proto !== null && !Array.isArray(val)) {
        seen.delete(val)
        return `[object ${(val as object).constructor?.name ?? 'Object'}]`
      }

      if (Array.isArray(val)) {
        const result = val.map(item => replacer(item, depth + 1))
        seen.delete(val)
        return result
      }

      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        result[k] = replacer(v, depth + 1)
      }
      seen.delete(val)
      return result
    }

    return JSON.stringify(replacer(value, 0)) ?? '{}'
  } catch {
    return '{}'
  }
}

export function createVue3Observer(
  subscriber: (event: VueComponentUpdateEvent) => void
): ObserverLike {
  let isObserving = false

  // Handler functions keyed by event name so we can remove them in teardown
  let updatedHandler: ((...args: unknown[]) => void) | null = null
  let emitHandler: ((...args: unknown[]) => void) | null = null
  let currentHook: Vue3DevToolsHook | null = null

  function handleComponentUpdated(instance: unknown) {
    const comp = instance as ComponentInternalInstance

    const name = getComponentName(comp)
    if (!name) return
    if (isVueBuiltin(name)) return

    const propsDelta = safeSerialise(comp.props ?? {})
    const setupStateDelta = safeSerialise(comp.setupState ?? {})

    // Apply 10 KB size guard -- if either delta exceeds the limit, drop the event
    if (
      propsDelta.length > MAX_DELTA_SIZE ||
      setupStateDelta.length > MAX_DELTA_SIZE
    ) {
      return
    }

    const event: VueComponentUpdateEvent = {
      type: StateEventType.VueComponentUpdate,
      time: Date.now(),
      frameId: 0,
      componentName: name,
      uid: comp.uid,
      propsDelta,
      setupStateDelta,
    }

    subscriber(event)
  }

  function handleComponentEmit(
    instance: unknown,
    _eventName: unknown,
    _payload: unknown
  ) {
    // Emit events are reported as a VueComponentUpdateEvent with empty deltas.
    // The event name and payload are not yet included in the event schema
    // (the codec only has componentName, uid, propsDelta, setupStateDelta).
    const comp = instance as ComponentInternalInstance

    const name = getComponentName(comp)
    if (!name) return
    if (isVueBuiltin(name)) return

    const event: VueComponentUpdateEvent = {
      type: StateEventType.VueComponentUpdate,
      time: Date.now(),
      frameId: 0,
      componentName: name,
      uid: comp.uid,
      propsDelta: '{}',
      setupStateDelta: '{}',
    }

    subscriber(event)
  }

  function attachToHook(hook: Vue3DevToolsHook) {
    currentHook = hook
    hook.on('component:updated', updatedHandler!)
    hook.on('component:emit', emitHandler!)
  }

  return {
    observe(_target: unknown, _vtree: VTree) {
      // Idempotency: a second call must not double-register handlers
      if (isObserving) return

      // Create stable handler references for later removal
      updatedHandler = (...args: unknown[]) => handleComponentUpdated(args[0])
      emitHandler = (...args: unknown[]) =>
        handleComponentEmit(args[0], args[1], args[2])

      const existingHook = (globalThis as Record<string, unknown>)[
        '__VUE_DEVTOOLS_GLOBAL_HOOK__'
      ] as Vue3DevToolsHook | undefined

      if (existingHook) {
        attachToHook(existingHook)
      } else {
        // Install a replay entry so we can attach when the hook appears later.
        // Vue 3 calls each function in __VUE_DEVTOOLS_HOOK_REPLAY__ with the
        // hook instance when it is created, giving us a second-chance attachment.
        const replay: Array<(hook: unknown) => void> =
          ((globalThis as Record<string, unknown>)[
            '__VUE_DEVTOOLS_HOOK_REPLAY__'
          ] as Array<(hook: unknown) => void> | undefined) ?? []

        const replayCallback = (hook: unknown) => {
          if (hook && !currentHook) {
            attachToHook(hook as Vue3DevToolsHook)
          }
        }

        replay.push(replayCallback)
        ;(globalThis as Record<string, unknown>)[
          '__VUE_DEVTOOLS_HOOK_REPLAY__'
        ] = replay
      }

      isObserving = true
    },

    disconnect() {
      if (currentHook && updatedHandler && emitHandler) {
        currentHook.off('component:updated', updatedHandler)
        currentHook.off('component:emit', emitHandler)
      }

      currentHook = null
      updatedHandler = null
      emitHandler = null
      isObserving = false
    },
  }
}
