import { StateEventType, VueComponentUpdateEvent } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createVue3Observer } from './vue3'

// Vue 3 devtools hook API
interface MockVueHook {
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): void
  _handlers: Map<string, Set<(...args: unknown[]) => void>>
}

function createMockHook(): MockVueHook {
  const _handlers: Map<string, Set<(...args: unknown[]) => void>> = new Map()

  return {
    _handlers,

    on(event: string, handler: (...args: unknown[]) => void) {
      if (!_handlers.has(event)) {
        _handlers.set(event, new Set())
      }
      _handlers.get(event)!.add(handler)
    },

    off(event: string, handler: (...args: unknown[]) => void) {
      _handlers.get(event)?.delete(handler)
    },

    emit(event: string, ...args: unknown[]) {
      for (const handler of _handlers.get(event) ?? []) {
        handler(...args)
      }
    },
  }
}

// Minimal ComponentInternalInstance-like object
interface MockComponentInstance {
  uid: number
  type: { name?: string; __name?: string; __file?: string }
  setupState: Record<string, unknown>
  props: Record<string, unknown>
  attrs: Record<string, unknown>
  parent: MockComponentInstance | null
}

function makeComponent(
  overrides: Partial<MockComponentInstance> = {}
): MockComponentInstance {
  return {
    uid: 1,
    type: { name: 'MyComponent' },
    setupState: {},
    props: {},
    attrs: {},
    parent: null,
    ...overrides,
  }
}

// Helper to install the mock hook globally and return a cleanup function
function withMockHook(hook: MockVueHook): () => void {
  ;(globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__ = hook
  return () => {
    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__
  }
}

describe('createVue3Observer', () => {
  it('returns an ObserverLike with observe and disconnect methods', () => {
    const observer = createVue3Observer(() => {})
    assert.equal(typeof observer.observe, 'function')
    assert.equal(typeof observer.disconnect, 'function')
  })

  it('installs listeners on __VUE_DEVTOOLS_GLOBAL_HOOK__ when observe() is called', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const observer = createVue3Observer(() => {})
    observer.observe(null as any, null as any)

    // Should have registered component:updated and component:emit listeners
    assert.ok(
      (hook._handlers.get('component:updated')?.size ?? 0) > 0,
      'should register component:updated handler'
    )
    assert.ok(
      (hook._handlers.get('component:emit')?.size ?? 0) > 0,
      'should register component:emit handler'
    )

    observer.disconnect()
    cleanup()
  })

  it('emits VueComponentUpdateEvent on component:updated', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    const component = makeComponent({
      uid: 42,
      type: { name: 'Counter' },
      setupState: { count: 5 },
      props: { label: 'hello' },
    })

    hook.emit('component:updated', component)

    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, StateEventType.VueComponentUpdate)
    assert.equal(events[0]?.componentName, 'Counter')
    assert.equal(events[0]?.uid, 42)
    assert.ok(typeof events[0]?.setupStateDelta === 'string')
    assert.ok(typeof events[0]?.propsDelta === 'string')

    observer.disconnect()
    cleanup()
  })

  it('reads component name from type.__name as fallback', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    const component = makeComponent({
      uid: 10,
      type: { __name: 'FallbackName' },
    })

    hook.emit('component:updated', component)

    assert.equal(events.length, 1)
    assert.equal(events[0]?.componentName, 'FallbackName')

    observer.disconnect()
    cleanup()
  })

  it('reads component name from type.__file as last fallback', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    const component = makeComponent({
      uid: 11,
      type: { __file: '/src/components/FileComp.vue' },
    })

    hook.emit('component:updated', component)

    assert.equal(events.length, 1)
    assert.equal(events[0]?.componentName, 'FileComp')

    observer.disconnect()
    cleanup()
  })

  it('skips anonymous components with no resolvable name', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    const component = makeComponent({ uid: 99, type: {} })

    hook.emit('component:updated', component)

    assert.equal(events.length, 0)

    observer.disconnect()
    cleanup()
  })

  it('skips internal Vue built-in components', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    const builtins = [
      'Transition',
      'TransitionGroup',
      'KeepAlive',
      'Suspense',
      'Teleport',
    ]

    for (const name of builtins) {
      hook.emit(
        'component:updated',
        makeComponent({ uid: 100, type: { name } })
      )
    }

    assert.equal(events.length, 0, 'all Vue built-ins should be skipped')

    observer.disconnect()
    cleanup()
  })

  it('skips component:updated when serialised delta exceeds 10 KB', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    // Build a setupState that serialises to > 10 KB
    const bigValue = 'x'.repeat(11_000)
    const component = makeComponent({
      uid: 200,
      type: { name: 'BigComponent' },
      setupState: { data: bigValue },
    })

    hook.emit('component:updated', component)

    assert.equal(events.length, 0, 'oversized delta should be dropped')

    observer.disconnect()
    cleanup()
  })

  it('teardown removes component:updated and component:emit listeners', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    observer.disconnect()

    // Fire events after disconnect -- nothing should be recorded
    const component = makeComponent({
      uid: 300,
      type: { name: 'AfterDisconnect' },
      setupState: { x: 1 },
    })
    hook.emit('component:updated', component)

    assert.equal(events.length, 0, 'no events after disconnect')

    cleanup()
  })

  it('component:emit events are captured (subscriber receives event)', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    const component = makeComponent({
      uid: 50,
      type: { name: 'ButtonComp' },
    })

    // component:emit fires with (instance, eventName, payload)
    hook.emit('component:emit', component, 'click', { x: 1, y: 2 })

    // component:emit should generate a VueComponentUpdateEvent with event info
    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, StateEventType.VueComponentUpdate)
    assert.equal(events[0]?.componentName, 'ButtonComp')

    observer.disconnect()
    cleanup()
  })

  it('uses __VUE_DEVTOOLS_HOOK_REPLAY__ fallback if hook not present at observe() time', () => {
    // Ensure no hook present initially
    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    // Simulate hook arriving later via the replay mechanism
    const hook = createMockHook()
    ;(globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__ = hook

    // Replay: Vue calls each queued callback with the newly-created hook
    const replayQueue: Array<(hook: unknown) => void> =
      ((globalThis as Record<string, unknown>)[
        '__VUE_DEVTOOLS_HOOK_REPLAY__'
      ] as Array<(hook: unknown) => void> | undefined) ?? []
    for (const fn of replayQueue) {
      fn(hook)
    }

    const component = makeComponent({
      uid: 77,
      type: { name: 'LateComponent' },
      setupState: { val: 1 },
    })
    hook.emit('component:updated', component)

    assert.equal(events.length, 1)
    assert.equal(events[0]?.componentName, 'LateComponent')

    observer.disconnect()
    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__
    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_HOOK_REPLAY__
  })

  it('calling observe() twice does not double-register listeners', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)
    observer.observe(null as any, null as any) // second call must be no-op

    const component = makeComponent({
      uid: 88,
      type: { name: 'Idempotent' },
      setupState: { x: 1 },
    })
    hook.emit('component:updated', component)

    assert.equal(
      events.length,
      1,
      'double observe() must not produce duplicate events'
    )

    observer.disconnect()
    cleanup()
  })

  it('propsDelta contains changed props serialised as JSON', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    const component = makeComponent({
      uid: 55,
      type: { name: 'PropsComp' },
      props: { label: 'hello', count: 3 },
    })

    hook.emit('component:updated', component)

    assert.equal(events.length, 1)
    const parsed = JSON.parse(events[0]?.propsDelta ?? '{}') as Record<
      string,
      unknown
    >
    assert.equal(parsed['label'], 'hello')
    assert.equal(parsed['count'], 3)

    observer.disconnect()
    cleanup()
  })

  it('setupStateDelta contains setup state serialised as JSON', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    const component = makeComponent({
      uid: 56,
      type: { name: 'StateComp' },
      setupState: { items: [1, 2, 3], active: true },
    })

    hook.emit('component:updated', component)

    assert.equal(events.length, 1)
    const parsed = JSON.parse(events[0]?.setupStateDelta ?? '{}') as Record<
      string,
      unknown
    >
    assert.deepEqual(parsed['items'], [1, 2, 3])
    assert.equal(parsed['active'], true)

    observer.disconnect()
    cleanup()
  })
})
