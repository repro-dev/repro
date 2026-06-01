// Vue 3 devtools hook API
export interface MockVueHook {
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): void
  _handlers: Map<string, Set<(...args: unknown[]) => void>>
}

export function createMockHook(): MockVueHook {
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
export interface MockComponentInstance {
  uid: number
  type: { name?: string; __name?: string; __file?: string }
  setupState: Record<string, unknown>
  props: Record<string, unknown>
  attrs: Record<string, unknown>
  parent: MockComponentInstance | null
}

export function makeComponent(
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
export function withMockHook(hook: MockVueHook): () => void {
  ;(globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__ = hook
  return () => {
    delete (globalThis as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__
  }
}
