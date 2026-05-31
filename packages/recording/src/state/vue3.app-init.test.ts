import { VueComponentUpdateEvent } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createVue3Observer } from './vue3'
import { createMockHook, withMockHook } from './vue3.test-helpers'

describe('createVue3Observer app:init', () => {
  it('app:init builds a name map from app._context.components', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    // Define component definitions (plain objects, as Vue uses them)
    const ButtonDef = {}
    const CardDef = {}

    // Mock app object as Vue 3 passes it to app:init
    const mockApp = {
      _context: {
        components: {
          MyButton: ButtonDef,
          MyCard: CardDef,
        } as Record<string, unknown>,
      },
    }

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    // Fire app:init with the mock app
    hook.emit('app:init', mockApp)

    // Now fire component:updated with a component whose type IS one of those defs,
    // but has no name/.__name/.__file on its type object
    const component = {
      uid: 400,
      type: ButtonDef as {
        name?: string
        __name?: string
        __file?: string
      },
      setupState: { clicked: false },
      props: {},
      attrs: {},
      parent: null,
    }

    hook.emit('component:updated', component)

    assert.equal(
      events.length,
      1,
      'should emit event for app:init-registered component'
    )
    assert.equal(
      events[0]?.componentName,
      'MyButton',
      'name should come from app._context.components map'
    )
    assert.equal(events[0]?.uid, 400)

    observer.disconnect()
    cleanup()
  })

  it('app:init name map takes priority over type.name for registered components', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const CompDef = { name: 'InternalName' }

    const mockApp = {
      _context: {
        components: {
          PublicName: CompDef,
        } as Record<string, unknown>,
      },
    }

    const events: VueComponentUpdateEvent[] = []
    const observer = createVue3Observer(event => events.push(event))
    observer.observe(null as any, null as any)

    hook.emit('app:init', mockApp)

    const component = {
      uid: 401,
      type: CompDef as {
        name?: string
        __name?: string
        __file?: string
      },
      setupState: {},
      props: {},
      attrs: {},
      parent: null,
    }

    hook.emit('component:updated', component)

    assert.equal(events.length, 1)
    assert.equal(
      events[0]?.componentName,
      'PublicName',
      'app:init registered name should take priority over type.name'
    )

    observer.disconnect()
    cleanup()
  })

  it('disconnect() removes the app:init listener', () => {
    const hook = createMockHook()
    const cleanup = withMockHook(hook)

    const observer = createVue3Observer(() => {})
    observer.observe(null as any, null as any)

    const sizeAfterObserve = hook._handlers.get('app:init')?.size ?? 0
    assert.ok(sizeAfterObserve > 0, 'app:init handler should be registered')

    observer.disconnect()

    const sizeAfterDisconnect = hook._handlers.get('app:init')?.size ?? 0
    assert.equal(
      sizeAfterDisconnect,
      0,
      'app:init handler should be removed on disconnect'
    )

    cleanup()
  })
})
