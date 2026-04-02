import { ReactCommitEvent, StateEventType } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createReactObserver,
  getComponentTree,
  resetComponentTree,
} from './react'

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
      _debugID: 42,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, StateEventType.ReactCommit)
    assert.equal(events[0]?.componentName, 'Button')
    assert.equal(events[0]?.fiberNodeId, 42)
    assert.equal(events[0]?.parentFiberId, 0) // no parent component
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
    assert.equal(parentEvent?.parentFiberId, 0) // no parent component above root
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

    assert.equal(gpEvent?.parentFiberId, 0) // grandparent has no component ancestor
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
})

describe('getComponentTree', () => {
  it('returns empty nodes array when no commits have occurred', () => {
    resetComponentTree()
    const tree = getComponentTree()
    assert.deepEqual(tree, { nodes: [] })
  })

  it('returns accumulated component nodes after a commit', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
    resetComponentTree()

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

    const tree = getComponentTree()
    assert.equal(tree.nodes.length, 1)
    const node = tree.nodes[0]!
    assert.equal(node.fiberNodeId, 500)
    assert.equal(node.componentName, 'MyButton')
    assert.ok(node.props.includes('Click'))

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('updates existing node when same fiberNodeId commits again with new props', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
    resetComponentTree()

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

    const tree = getComponentTree()
    // Should still have exactly one node (same fiberNodeId)
    assert.equal(tree.nodes.length, 1)
    const node = tree.nodes[0]!
    assert.equal(node.fiberNodeId, 600)
    assert.ok(node.props.includes('2'))

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('skips fiberNodeId 0 (unknown sentinel) from the component tree', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
    resetComponentTree()

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    // Fiber with no _debugID (will have fiberNodeId = 0)
    const fiber = makeFiber({
      tag: 0,
      type: { name: 'Anonymous' },
      memoizedProps: { x: 1 },
      alternate: null,
      _debugID: undefined,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    const tree = getComponentTree()
    // fiberNodeId 0 should be skipped
    assert.equal(tree.nodes.length, 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('resetComponentTree clears accumulated state', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
    resetComponentTree()

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
    assert.equal(getComponentTree().nodes.length, 1)

    resetComponentTree()
    assert.equal(getComponentTree().nodes.length, 0)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })
})
