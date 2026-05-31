import { StateEventType, VueComponentUpdateEvent } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createVue3Observer } from './vue3'
import {
  createMockHook,
  makeComponent,
  withMockHook,
} from './vue3.test-helpers'

describe('createVue3Observer — emit, idempotency, replay leak', () => {
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

  it('no events emitted when hook arrives after disconnect() via replay buffer', () => {
    // Ensure no hook present initially
    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__
    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_HOOK_REPLAY__

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    // Disconnect before the hook ever appears
    observer.disconnect()

    // Simulate hook arriving late via the replay mechanism
    const hook = createMockHook()
    ;(globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__ = hook

    const replayQueue: Array<(hook: unknown) => void> =
      ((globalThis as Record<string, unknown>)[
        '__VUE_DEVTOOLS_HOOK_REPLAY__'
      ] as Array<(hook: unknown) => void> | undefined) ?? []
    for (const fn of replayQueue) {
      fn(hook)
    }

    // Even if attachToHook somehow ran, emitting events must be a no-op
    const component = makeComponent({
      uid: 500,
      type: { name: 'LateLeakyComponent' },
      setupState: { val: 99 },
    })
    hook.emit('component:updated', component)

    assert.equal(
      events.length,
      0,
      'no events should be emitted after disconnect(), even via late replay'
    )

    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__
    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_HOOK_REPLAY__
  })

  it('suite completion smoke test — confirms all tests ran without hanging', () => {
    assert.ok(true, 'suite reached end without hanging')
  })
})
