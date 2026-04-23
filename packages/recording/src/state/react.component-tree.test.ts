import { ReactCommitEvent } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createReactObserver } from './react'

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

function makeFiberRoot(current: MockFiber) {
  return { current }
}

function simulateCommit(rendererID: number, root: { current: MockFiber }) {
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  if (hook?.onCommitFiberRoot) {
    hook.onCommitFiberRoot(rendererID, root, undefined)
  }
}

describe('getComponentTree (instance method)', () => {
  it('returns null when no commits have occurred', () => {
    const observer = createReactObserver(() => {})
    assert.equal(observer.getComponentTree(), null)
  })

  it('returns accumulated component nodes after a commit', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
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
      type: { name: 'Counter' },
      memoizedProps: { count: 1 },
      alternate: null,
      _debugID: 600,
    })

    simulateCommit(1, makeFiberRoot(fiber1))

    const fiber2 = makeFiber({
      type: { name: 'Counter' },
      memoizedProps: { count: 2 },
      alternate: fiber1,
      _debugID: 600,
    })

    simulateCommit(1, makeFiberRoot(fiber2))

    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.equal(tree.rootId, 600)
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

    const fiber = makeFiber({
      type: { name: 'Anonymous' },
      memoizedProps: { x: 1 },
      alternate: null,
      _debugID: undefined,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(observer.getComponentTree(), null)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('resetComponentTree clears accumulated state', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const observer = createReactObserver(() => {})
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
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

    assert.equal(obs2.getComponentTree(), null)

    obs2.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('records fibers with unchanged props in componentTree even if no event emitted', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const sharedProps = { label: 'Same' }
    const alternate = makeFiber({
      type: { name: 'StableLabel' },
      memoizedProps: sharedProps,
      _debugID: 1001,
    })

    const fiber = makeFiber({
      type: { name: 'StableLabel' },
      memoizedProps: sharedProps,
      alternate,
      _debugID: 1001,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 0)

    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.ok('1001' in tree.nodes)
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

    const parentAlt = makeFiber({
      type: { name: 'ParentStable' },
      memoizedProps: { p: 1 },
      _debugID: 2000,
    })

    const parent = makeFiber({
      type: { name: 'ParentStable' },
      memoizedProps: { p: 1 },
      alternate: parentAlt,
      _debugID: 2000,
      return: null,
    })

    const child = makeFiber({
      type: { name: 'ChildChanged' },
      memoizedProps: { c: 2 },
      alternate: null,
      _debugID: 2001,
      return: parent,
    })

    parent.child = child

    simulateCommit(1, makeFiberRoot(parent))

    assert.equal(events.length, 1)
    assert.equal(events[0]?.componentName, 'ChildChanged')

    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.ok('2000' in tree.nodes)
    assert.ok('2001' in tree.nodes)
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

    const fiber = makeFiber({
      type: { name: 'NoProps' },
      memoizedProps: null,
      alternate: null,
      _debugID: 3000,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 0)

    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.ok('3000' in tree.nodes)
    assert.equal(tree.nodes['3000']?.componentName, 'NoProps')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('preserves the last props snapshot on hook-only commits', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: ReactCommitEvent[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)

    const sharedProps = { label: 'Before' }
    const prevHook = makeHookNode(0)
    const nextHook = makeHookNode(1)

    const initialFiber = makeFiber({
      type: { name: 'StableLabel' },
      memoizedProps: sharedProps,
      memoizedState: prevHook,
      alternate: null,
      _debugID: 4000,
      _debugHookTypes: ['useState'],
    })

    simulateCommit(1, makeFiberRoot(initialFiber))

    const fiber = makeFiber({
      type: { name: 'StableLabel' },
      memoizedProps: sharedProps,
      memoizedState: prevHook,
      alternate: initialFiber,
      _debugID: 4000,
      _debugHookTypes: ['useState'],
    })

    fiber.memoizedState = nextHook

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 2)
    const tree = observer.getComponentTree()
    assert.ok(tree !== null)
    assert.equal(tree.nodes['4000']?.componentName, 'StableLabel')
    assert.ok(tree.nodes['4000']?.props.includes('Before'))
    assert.notEqual(tree.nodes['4000']?.props, '{}')

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })
})
