import { StateEventType, VueComponentUpdateEvent } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createVue3Observer } from './vue3'
import {
  createMockHook,
  makeComponent,
  withMockHook,
} from './vue3.test-helpers'

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

    // Should have registered component:updated, component:emit, and app:init listeners
    assert.ok(
      (hook._handlers.get('component:updated')?.size ?? 0) > 0,
      'should register component:updated handler'
    )
    assert.ok(
      (hook._handlers.get('component:emit')?.size ?? 0) > 0,
      'should register component:emit handler'
    )
    assert.ok(
      (hook._handlers.get('app:init')?.size ?? 0) > 0,
      'should register app:init handler'
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

  it('skips component:updated when combined serialised delta exceeds 10 KB', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    // Build a setupState where props + setupState combined exceed 10 KB
    // Each part is ~5.5 KB so individually under limit but combined over limit
    const halfBigValue = 'x'.repeat(5_500)
    const component = makeComponent({
      uid: 200,
      type: { name: 'BigComponent' },
      setupState: { data: halfBigValue },
      props: { extra: halfBigValue },
    })

    hook.emit('component:updated', component)

    assert.equal(events.length, 0, 'oversized combined delta should be dropped')

    observer.disconnect()
    cleanup()
  })

  it('teardown removes component:updated, component:emit and app:init listeners', () => {
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
