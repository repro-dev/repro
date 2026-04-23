import { ReactCommitEvent, StateEventType } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createReactObserver } from './react'

// Minimal Fiber-like object for testing
interface MockFiber {
  tag: number
  type?: { displayName?: string; name?: string } | null
  memoizedProps: Record<string, unknown> | null
  memoizedState: unknown
  alternate: MockFiber | null
  child: MockFiber | null
  sibling: MockFiber | null
  return: MockFiber | null
  _debugID?: number
  _debugHookTypes?: string[]
}

function makeFiber(overrides: Partial<MockFiber> = {}): MockFiber {
  return {
    tag: 0,
    type: { name: 'MyComponent' },
    memoizedProps: {},
    memoizedState: null,
    alternate: null,
    child: null,
    sibling: null,
    return: null,
    _debugID: 0,
    ...overrides,
  }
}

function makeHookNode(
  memoizedState: unknown,
  next: { memoizedState: unknown; next: unknown } | null = null
) {
  return { memoizedState, next }
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

  it('returns getComponentTree and resetComponentTree methods', () => {
    const observer = createReactObserver(() => {})
    assert.equal(typeof observer.getComponentTree, 'function')
    assert.equal(typeof observer.resetComponentTree, 'function')
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
      _debugID: 42,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, StateEventType.ReactCommit)
    assert.equal(events[0]?.componentName, 'Button')
    assert.equal(events[0]?.fiberNodeId, 42)
    assert.equal(events[0]?.parentFiberId, null) // no parent component
    assert.ok((events[0]?.commitBatchId ?? 0) > 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('two sibling components updated in same commit share commitBatchId', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    // Two sibling components under a common host root — siblings must be
    // children of a root fiber, not the root itself, so walkFiber visits both.
    const sibling2 = makeFiber({
      tag: 0,
      type: { name: 'Sibling2' },
      memoizedProps: { x: 2 },
      alternate: null,
      _debugID: 102,
    })

    const sibling1 = makeFiber({
      tag: 0,
      type: { name: 'Sibling1' },
      memoizedProps: { x: 1 },
      alternate: null,
      _debugID: 101,
      sibling: sibling2,
    })

    // Wrap in a non-component root so walkFiber doesn't stop at sibling1
    const root = makeFiber({
      tag: 3, // HostRoot — not tracked
      type: null,
      memoizedProps: null,
      alternate: null,
      child: sibling1,
    })

    simulateCommit(1, makeFiberRoot(root))

    assert.equal(events.length, 2)
    // Both events from the same commit must have the same commitBatchId
    assert.equal(events[0]?.commitBatchId, events[1]?.commitBatchId)
    assert.ok((events[0]?.commitBatchId ?? 0) > 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('different commits have incrementing commitBatchIds', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const fiber1 = makeFiber({
      tag: 0,
      type: { name: 'CompA' },
      memoizedProps: { a: 1 },
      alternate: null,
      _debugID: 201,
    })

    const fiber2 = makeFiber({
      tag: 0,
      type: { name: 'CompB' },
      memoizedProps: { b: 2 },
      alternate: null,
      _debugID: 202,
    })

    simulateCommit(1, makeFiberRoot(fiber1))
    simulateCommit(1, makeFiberRoot(fiber2))

    assert.equal(events.length, 2)
    // Second commit must have a higher batchId than first
    assert.ok((events[1]?.commitBatchId ?? 0) > (events[0]?.commitBatchId ?? 0))

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it("child component's parentFiberId equals parent fiber's fiberNodeId", () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    // Build a parent -> child fiber chain; child.return = parent
    const parent = makeFiber({
      tag: 0,
      type: { name: 'Parent' },
      memoizedProps: { p: 1 },
      alternate: null,
      _debugID: 300,
      return: null,
    })

    const child = makeFiber({
      tag: 0,
      type: { name: 'Child' },
      memoizedProps: { c: 1 },
      alternate: null,
      _debugID: 301,
      return: parent, // child.return points to parent
    })

    // Wire parent.child = child so walkFiber traverses both
    parent.child = child

    simulateCommit(1, makeFiberRoot(parent))

    assert.equal(events.length, 2)

    const parentEvent = events.find(e => e.componentName === 'Parent')
    const childEvent = events.find(e => e.componentName === 'Child')

    assert.ok(parentEvent)
    assert.ok(childEvent)

    assert.equal(parentEvent?.fiberNodeId, 300)
    assert.equal(parentEvent?.parentFiberId, null) // no parent component above root
    assert.equal(childEvent?.fiberNodeId, 301)
    assert.equal(childEvent?.parentFiberId, 300) // child's parent is the parent component
    // Same commit → same batchId
    assert.equal(parentEvent?.commitBatchId, childEvent?.commitBatchId)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('parentFiberId skips intermediate host fibers to find nearest component ancestor', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    // Chain: grandparent (component, _debugID=400)
    //         -> hostDiv (tag=5, host element, no _debugID)
    //             -> child (component, _debugID=401)
    const grandparent = makeFiber({
      tag: 0,
      type: { name: 'GrandParent' },
      memoizedProps: { gp: 1 },
      alternate: null,
      _debugID: 400,
      return: null,
    })

    const hostDiv = makeFiber({
      tag: 5, // HostComponent — not tracked
      type: null,
      memoizedProps: { className: 'wrapper' },
      alternate: null,
      _debugID: undefined,
      return: grandparent,
    })

    const child = makeFiber({
      tag: 0,
      type: { name: 'Child' },
      memoizedProps: { c: 1 },
      alternate: null,
      _debugID: 401,
      return: hostDiv, // child's immediate return is a host fiber
    })

    // Wire traversal: grandparent.child = hostDiv, hostDiv.child = child
    grandparent.child = hostDiv
    hostDiv.child = child

    simulateCommit(1, makeFiberRoot(grandparent))

    assert.equal(events.length, 2) // Only component fibers emit events

    const gpEvent = events.find(e => e.componentName === 'GrandParent')
    const childEvent = events.find(e => e.componentName === 'Child')

    assert.ok(gpEvent)
    assert.ok(childEvent)

    assert.equal(gpEvent?.parentFiberId, null) // grandparent has no component ancestor
    assert.equal(childEvent?.parentFiberId, 400) // child skips hostDiv and points to grandparent

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

  it('clears componentTree on disconnect', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Foo' },
      memoizedProps: { a: 1 },
      alternate: null,
      _debugID: 800,
    })

    simulateCommit(1, makeFiberRoot(fiber))
    assert.equal(
      Object.keys(observer.getComponentTree()?.nodes ?? {}).length,
      1
    )

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    // After disconnect, tree is cleared (rootFiberId reset → returns null)
    assert.equal(observer.getComponentTree(), null)
  })

  it('dev build captures useState type and value', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const prevHook = makeHookNode(0)
    const nextHook = makeHookNode(1)

    const alternate = makeFiber({
      tag: 0,
      type: { name: 'Counter' },
      memoizedProps: { label: 'Count' },
      memoizedState: prevHook,
      _debugID: 100,
      _debugHookTypes: ['useState'],
    })

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Counter' },
      memoizedProps: { label: 'Count' },
      memoizedState: nextHook,
      alternate,
      _debugID: 100,
      _debugHookTypes: ['useState'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.ok(Array.isArray(delta))
    assert.equal(delta.length, 1)
    assert.equal(delta[0].index, 0)
    assert.equal(delta[0].type, 'useState')
    assert.equal(delta[0].state, 1)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('dev build captures useEffect deps', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const prevHook = makeHookNode({ deps: [1] })
    const nextHook = makeHookNode({ deps: [1, 2] })

    const alternate = makeFiber({
      tag: 0,
      type: { name: 'EffectComp' },
      memoizedProps: {},
      memoizedState: prevHook,
      _debugID: 200,
      _debugHookTypes: ['useEffect'],
    })

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'EffectComp' },
      memoizedProps: {},
      memoizedState: nextHook,
      alternate,
      _debugID: 200,
      _debugHookTypes: ['useEffect'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta[0].type, 'useEffect')
    assert.deepEqual(delta[0].deps, [1, 2])

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('dev build captures useMemo state and deps', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const prevHook = makeHookNode(['cached', [1]])
    const nextHook = makeHookNode(['newCached', [1, 2]])

    const alternate = makeFiber({
      tag: 0,
      type: { name: 'MemoComp' },
      memoizedProps: {},
      memoizedState: prevHook,
      _debugID: 300,
      _debugHookTypes: ['useMemo'],
    })

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'MemoComp' },
      memoizedProps: {},
      memoizedState: nextHook,
      alternate,
      _debugID: 300,
      _debugHookTypes: ['useMemo'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta[0].type, 'useMemo')
    assert.equal(delta[0].state, 'newCached')
    assert.deepEqual(delta[0].deps, [1, 2])

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('production degrades gracefully (no _debugHookTypes)', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const prevHook = makeHookNode(0)
    const nextHook = makeHookNode(1)

    const alternate = makeFiber({
      tag: 0,
      type: { name: 'Counter' },
      memoizedProps: {},
      memoizedState: prevHook,
      _debugID: 400,
    })

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Counter' },
      memoizedProps: {},
      memoizedState: nextHook,
      alternate,
      _debugID: 400,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta[0].index, 0)
    assert.ok(!('type' in delta[0]))
    assert.equal(delta[0].state, 1)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('emits event when hooks change but props are stable', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const sharedProps = { label: 'Same' }

    const prevHook = makeHookNode(0)
    const nextHook = makeHookNode(1)

    const alternate = makeFiber({
      tag: 0,
      type: { name: 'StableProps' },
      memoizedProps: sharedProps,
      memoizedState: prevHook,
      _debugID: 500,
    })

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'StableProps' },
      memoizedProps: sharedProps,
      memoizedState: nextHook,
      alternate,
      _debugID: 500,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.notEqual(events[0]!.hooksDelta, '{}')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('returns empty hooks delta when memoizedState is null', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'NoHooks' },
      memoizedProps: { a: 1 },
      memoizedState: null,
      alternate: null,
      _debugID: 600,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.equal(events[0]!.hooksDelta, '{}')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('guards against circular memoizedState chains', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const node1 = makeHookNode(1)
    const node2 = makeHookNode(2)
    const node3 = makeHookNode(3)

    ;(node1 as any).next = node2
    ;(node2 as any).next = node3
    ;(node3 as any).next = node1

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Circular' },
      memoizedProps: { a: 1 },
      memoizedState: node1,
      alternate: null,
      _debugID: 700,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta.length, 3)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('skips event when hooksDelta exceeds size limit', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const bigValue = 'x'.repeat(20_000)
    const hook = makeHookNode(bigValue)

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'BigHooks' },
      memoizedProps: {},
      memoizedState: hook,
      alternate: null,
      _debugID: 800,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('preserves order and indices for multiple hooks', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const hook3 = makeHookNode('memoized')
    const hook2 = makeHookNode({ deps: [1] })
    const hook1 = makeHookNode(42)

    ;(hook1 as any).next = hook2
    ;(hook2 as any).next = hook3

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'MultiHook' },
      memoizedProps: {},
      memoizedState: hook1,
      alternate: null,
      _debugID: 900,
      _debugHookTypes: ['useState', 'useEffect', 'useMemo'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta.length, 3)
    assert.equal(delta[0].index, 0)
    assert.equal(delta[0].type, 'useState')
    assert.equal(delta[1].index, 1)
    assert.equal(delta[1].type, 'useEffect')
    assert.equal(delta[2].index, 2)
    assert.equal(delta[2].type, 'useMemo')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })
})

describe('getComponentTree (instance method)', () => {
  it('returns null when no commits have occurred', () => {
    const observer = createReactObserver(() => {})
    const tree = observer.getComponentTree()
    assert.equal(tree, null)
  })

  it('returns accumulated component nodes after a commit', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'MyButton' },
      memoizedProps: { label: 'Click' },
      alternate: null,
      _debugID: 500,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.equal(tree.rootId, 500)
    assert.equal(Object.keys(tree.nodes).length, 1)
    const node = tree.nodes['500']!
    assert.equal(node.fiberNodeId, 500)
    assert.equal(node.componentName, 'MyButton')
    assert.ok(node.props.includes('Click'))

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('updates existing node when same fiberNodeId commits again with new props', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    const fiber1 = makeFiber({
      tag: 0,
      type: { name: 'Counter' },
      memoizedProps: { count: 1 },
      alternate: null,
      _debugID: 600,
    })

    simulateCommit(1, makeFiberRoot(fiber1))

    // Same fiberNodeId, different props
    const fiber2 = makeFiber({
      tag: 0,
      type: { name: 'Counter' },
      memoizedProps: { count: 2 },
      alternate: fiber1,
      _debugID: 600,
    })

    simulateCommit(1, makeFiberRoot(fiber2))

    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.equal(tree.rootId, 600)
    // Should still have exactly one node (same fiberNodeId)
    assert.equal(Object.keys(tree.nodes).length, 1)
    const node = tree.nodes['600']!
    assert.equal(node.fiberNodeId, 600)
    assert.ok(node.props.includes('2'))

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('skips fiberNodeId 0 (unknown sentinel) from the component tree', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    // Fiber with no _debugID (will have fiberNodeId = 0); root fiber also has no _debugID
    // so rootFiberId stays null and getComponentTree returns null
    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Anonymous' },
      memoizedProps: { x: 1 },
      alternate: null,
      _debugID: undefined,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    const tree = observer.getComponentTree()
    // No root fiber ID captured → returns null
    assert.equal(tree, null)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('resetComponentTree clears accumulated state', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Foo' },
      memoizedProps: { a: 1 },
      alternate: null,
      _debugID: 700,
    })

    simulateCommit(1, makeFiberRoot(fiber))
    const treeAfterCommit = observer.getComponentTree()
    assert.ok(treeAfterCommit !== null)
    assert.equal(Object.keys(treeAfterCommit.nodes).length, 1)

    observer.resetComponentTree()
    // resetComponentTree only clears nodes, not rootFiberId — tree is non-null but empty
    const treeAfterReset = observer.getComponentTree()
    assert.ok(treeAfterReset !== null)
    assert.equal(Object.keys(treeAfterReset.nodes).length, 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('two independent observers do not share component tree state', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const obs1 = createReactObserver(() => {})
    obs1.observe(null as any, null as any)

    const fiber1 = makeFiber({
      tag: 0,
      type: { name: 'CompA' },
      memoizedProps: { x: 1 },
      alternate: null,
      _debugID: 900,
    })

    simulateCommit(1, makeFiberRoot(fiber1))

    obs1.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const obs2 = createReactObserver(() => {})
    obs2.observe(null as any, null as any)

    // obs2 starts with a fresh empty tree — it should not see obs1's commits
    assert.equal(obs2.getComponentTree(), null)

    obs2.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  // REP-728: componentTree must be updated for ALL tracked fibers, not just
  // those with changed props. The bug: the tree.set() call was inside the
  // changedProps guard, so components with stable props were never recorded.
  it('records fibers with unchanged props in componentTree even if no event emitted', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const sharedProps = { label: 'Same' }

    // Fiber with identical alternate props → no changedProps → no event emitted
    const alternate = makeFiber({
      tag: 0,
      type: { name: 'StableLabel' },
      memoizedProps: sharedProps,
      _debugID: 1001,
    })

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'StableLabel' },
      memoizedProps: sharedProps, // same reference → Object.is = true
      alternate,
      _debugID: 1001,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    // No event emitted — props didn't change
    assert.equal(events.length, 0)

    // But the component MUST appear in the tree
    const tree = observer.getComponentTree()
    assert.ok(tree !== null, 'tree should not be null after commit')
    assert.ok('1001' in tree.nodes, 'StableLabel should be in componentTree')
    assert.equal(tree.nodes['1001']?.componentName, 'StableLabel')
    assert.equal(tree.nodes['1001']?.fiberNodeId, 1001)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('records a parent component in componentTree even when only the child props changed', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    // Parent: stable props (no event)
    const parentAlt = makeFiber({
      tag: 0,
      type: { name: 'ParentStable' },
      memoizedProps: { p: 1 },
      _debugID: 2000,
    })

    const parent = makeFiber({
      tag: 0,
      type: { name: 'ParentStable' },
      memoizedProps: { p: 1 }, // unchanged
      alternate: parentAlt,
      _debugID: 2000,
      return: null,
    })

    // Child: changed props (event emitted)
    const child = makeFiber({
      tag: 0,
      type: { name: 'ChildChanged' },
      memoizedProps: { c: 2 },
      alternate: null, // first render → changed
      _debugID: 2001,
      return: parent,
    })

    parent.child = child

    simulateCommit(1, makeFiberRoot(parent))

    // Only the child emits an event
    assert.equal(events.length, 1)
    assert.equal(events[0]?.componentName, 'ChildChanged')

    // Both parent and child must appear in the tree
    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.ok('2000' in tree.nodes, 'ParentStable must be in componentTree')
    assert.ok('2001' in tree.nodes, 'ChildChanged must be in componentTree')
    assert.equal(tree.nodes['2000']?.componentName, 'ParentStable')
    assert.equal(tree.nodes['2001']?.parentFiberId, 2000)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('records component with no props (null memoizedProps) in componentTree', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    // getChangedProps returns null when nextFiber.memoizedProps is null
    const fiber = makeFiber({
      tag: 0,
      type: { name: 'NoProps' },
      memoizedProps: null,
      alternate: null,
      _debugID: 3000,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    // No event (null props → changedProps is null)
    assert.equal(events.length, 0)

    // But the component must still appear in the tree
    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.ok('3000' in tree.nodes, 'NoProps should be in componentTree')
    assert.equal(tree.nodes['3000']?.componentName, 'NoProps')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })
})

describe('idempotency and re-attach (REP-729)', () => {
  it('calling observe() twice does not double-wrap the hook', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)
    observer.observe(null as any, null as any) // second call must be a no-op

    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Widget' },
      memoizedProps: { x: 1 },
      alternate: null,
      _debugID: 4001,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    // If the hook was double-wrapped, there would be 2 events
    assert.equal(
      events.length,
      1,
      'double observe() must not produce duplicate events'
    )

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('after disconnect(), observe() can re-attach and receives commits', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })

    // First session
    observer.observe(null as any, null as any)
    const fiber1 = makeFiber({
      tag: 0,
      type: { name: 'Session1' },
      memoizedProps: { s: 1 },
      alternate: null,
      _debugID: 5001,
    })
    simulateCommit(1, makeFiberRoot(fiber1))
    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const eventsAfterFirstSession = events.length
    assert.equal(eventsAfterFirstSession, 1)

    // Second session — re-attach after disconnect
    observer.observe(null as any, null as any)
    const fiber2 = makeFiber({
      tag: 0,
      type: { name: 'Session2' },
      memoizedProps: { s: 2 },
      alternate: null,
      _debugID: 5002,
    })
    simulateCommit(1, makeFiberRoot(fiber2))

    // Should have received the second session's commit
    assert.equal(
      events.length,
      2,
      'observer must receive commits after re-attach'
    )

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('componentTree and commitBatchCounter are reset when re-attaching after disconnect', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })

    // First session: accumulate some state
    observer.observe(null as any, null as any)
    const fiber1 = makeFiber({
      tag: 0,
      type: { name: 'OldComp' },
      memoizedProps: { v: 1 },
      alternate: null,
      _debugID: 6001,
    })
    simulateCommit(1, makeFiberRoot(fiber1))
    simulateCommit(1, makeFiberRoot(fiber1)) // second commit → commitBatchId = 2

    // Verify state was accumulated
    const treeBeforeDisconnect = observer.getComponentTree()
    assert.ok(
      treeBeforeDisconnect !== null,
      'tree should be populated before disconnect'
    )
    const batchIdBeforeDisconnect =
      events[events.length - 1]?.commitBatchId ?? 0
    assert.ok(
      batchIdBeforeDisconnect >= 2,
      'batchId should be at least 2 after two commits'
    )

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    // Second session: re-attach and check that state was reset
    observer.observe(null as any, null as any)

    // componentTree must be empty at start of new session
    assert.equal(
      observer.getComponentTree(),
      null,
      'componentTree must be null at start of new session'
    )

    // First commit in new session must start with batchId = 1 (reset from prior state)
    const fiber2 = makeFiber({
      tag: 0,
      type: { name: 'NewComp' },
      memoizedProps: { v: 2 },
      alternate: null,
      _debugID: 6002,
    })
    simulateCommit(1, makeFiberRoot(fiber2))

    const newSessionEvent = events[events.length - 1]
    assert.equal(
      newSessionEvent?.commitBatchId,
      1,
      'commitBatchId must restart from 1 in a new session'
    )

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })
})
