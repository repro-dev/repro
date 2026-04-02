import { ReactCommitEvent, StateEventType } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createReactObserver } from './react'

// Minimal Fiber-like object for testing
interface MockFiber {
  tag: number
  type?: { displayName?: string; name?: string } | null
  memoizedProps: Record<string, unknown> | null
  alternate: MockFiber | null
  child: MockFiber | null
  sibling: MockFiber | null
  return: MockFiber | null
  _debugID?: number
}

function makeFiber(overrides: Partial<MockFiber> = {}): MockFiber {
  return {
    tag: 0,
    type: { name: 'MyComponent' },
    memoizedProps: {},
    alternate: null,
    child: null,
    sibling: null,
    return: null,
    _debugID: 0,
    ...overrides,
  }
}

// Minimal FiberRoot-like object
function makeFiberRoot(current: MockFiber) {
  return { current }
}

// Helper to simulate a DevTools commit
function simulateCommit(rendererID: number, root: { current: MockFiber }) {
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  if (hook?.onCommitFiberRoot) {
    hook.onCommitFiberRoot(rendererID, root, undefined)
  }
}

describe('createReactObserver', () => {
  it('returns an ObserverLike with observe and disconnect methods', () => {
    const observer = createReactObserver(() => {})
    assert.equal(typeof observer.observe, 'function')
    assert.equal(typeof observer.disconnect, 'function')
  })

  it('installs __REACT_DEVTOOLS_GLOBAL_HOOK__ when not present', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    assert.ok((globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__)
    assert.equal(
      typeof (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
        .onCommitFiberRoot,
      'function'
    )

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('wraps existing onCommitFiberRoot without replacing the hook object', () => {
    const originalFn = () => {}
    const originalHook = {
      onCommitFiberRoot: originalFn,
      isDisabled: false,
      inject: () => {},
      _renderers: {},
      helpers: {},
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
    }
    ;(globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = originalHook

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    // The hook object itself must be preserved (same reference)
    assert.equal(
      (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__,
      originalHook
    )
    // onCommitFiberRoot should be a new wrapper (different from the original function)
    assert.notEqual(
      (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot,
      originalFn
    )

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('emits one ReactCommitEvent per fiber with changed props', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []

    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    // Fiber whose props changed (no alternate = first render = changed)
    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Button' },
      memoizedProps: { onClick: () => {}, label: 'Click me' },
      alternate: null, // no alternate → new mount, props changed
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, StateEventType.ReactCommit)
    assert.equal(events[0]?.componentName, 'Button')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('skips fibers where no props changed', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const sharedProps = { label: 'Same' }

    // Alternate has same props → no changes
    const alternate = makeFiber({
      tag: 0,
      type: { name: 'Label' },
      memoizedProps: sharedProps,
    })

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Label' },
      memoizedProps: sharedProps, // exact same reference → Object.is returns true
      alternate,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('captures MemoComponent fibers (tag = 14) with changed props', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    // MemoComponent: type.type holds the inner component
    const fiber = makeFiber({
      tag: 14,
      type: { displayName: undefined, name: undefined } as any,
      memoizedProps: { value: 42 },
      alternate: null,
    })
    // Attach the inner type
    ;(fiber.type as any).type = { name: 'MemoButton' }

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.equal(events[0]?.componentName, 'MemoButton')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('captures SimpleMemoComponent fibers (tag = 15) with changed props', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
      tag: 15,
      type: { name: 'SimpleLabel' },
      memoizedProps: { text: 'hello' },
      alternate: null,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.equal(events[0]?.componentName, 'SimpleLabel')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('skips HostComponent fibers (tag = 5)', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
      tag: 5, // HostComponent
      type: null,
      memoizedProps: { className: 'foo' },
      alternate: null,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('skips components whose serialised propsDelta exceeds 10,000 chars', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    // Create a prop value that will exceed 10,000 chars when serialised
    const bigValue = 'x'.repeat(11_000)
    const fiber = makeFiber({
      tag: 0,
      type: { name: 'BigComponent' },
      memoizedProps: { data: bigValue },
      alternate: null,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('restores original onCommitFiberRoot on disconnect', () => {
    const originalFn = () => {}
    const originalHook = {
      onCommitFiberRoot: originalFn,
      isDisabled: false,
      inject: () => {},
      _renderers: {},
      helpers: {},
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
    }
    ;(globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = originalHook

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    // After observe, should be wrapped
    assert.notEqual(
      (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot,
      originalFn
    )

    observer.disconnect()

    // After disconnect, should be restored
    assert.equal(
      (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot,
      originalFn
    )

    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })
})
