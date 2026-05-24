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

function createObserver() {
  delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

  const events: ReactCommitEvent[] = []
  const observer = createReactObserver(event => {
    events.push(event)
  })
  observer.observe(null as any, null as any)

  return { events, observer }
}

function cleanup(observer: ReturnType<typeof createReactObserver>) {
  observer.disconnect()
  delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
}

describe('createReactObserver hook deltas', () => {
  it('captures useState state and index', () => {
    const { events, observer } = createObserver()

    const prevHook = makeHookNode(0)
    const nextHook = makeHookNode(1)

    const alternate = makeFiber({
      type: { name: 'Counter' },
      memoizedProps: { label: 'Count' },
      memoizedState: prevHook,
      _debugID: 100,
      _debugHookTypes: ['useState'],
    })

    const fiber = makeFiber({
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
    assert.equal(delta[0].type, 'useState')
    assert.equal(delta[0].index, 0)
    assert.equal(delta[0].state, 1)

    cleanup(observer)
  })

  it('captures useReducer state', () => {
    const { events, observer } = createObserver()

    const prevHook = makeHookNode({ count: 0 })
    const nextHook = makeHookNode({ count: 1 })

    const alternate = makeFiber({
      type: { name: 'ReducerCounter' },
      memoizedProps: {},
      memoizedState: prevHook,
      _debugID: 200,
      _debugHookTypes: ['useReducer'],
    })

    const fiber = makeFiber({
      type: { name: 'ReducerCounter' },
      memoizedProps: {},
      memoizedState: nextHook,
      alternate,
      _debugID: 200,
      _debugHookTypes: ['useReducer'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta[0].type, 'useReducer')
    assert.deepEqual(delta[0].state, { count: 1 })

    cleanup(observer)
  })

  it('captures useCallback state and deps', () => {
    const { events, observer } = createObserver()

    const prevHook = makeHookNode([() => {}, [1]])
    const nextHook = makeHookNode([() => {}, [2]])

    const alternate = makeFiber({
      type: { name: 'CallbackComp' },
      memoizedProps: {},
      memoizedState: prevHook,
      _debugID: 300,
      _debugHookTypes: ['useCallback'],
    })

    const fiber = makeFiber({
      type: { name: 'CallbackComp' },
      memoizedProps: {},
      memoizedState: nextHook,
      alternate,
      _debugID: 300,
      _debugHookTypes: ['useCallback'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta[0].type, 'useCallback')
    assert.equal(delta[0].state, '[function]')
    assert.deepEqual(delta[0].deps, [2])

    cleanup(observer)
  })

  it('captures useEffect deps when they change', () => {
    const { events, observer } = createObserver()

    const prevHook = makeHookNode({ deps: [1] })
    const nextHook = makeHookNode({ deps: [1, 2] })

    const alternate = makeFiber({
      type: { name: 'EffectComp' },
      memoizedProps: {},
      memoizedState: prevHook,
      _debugID: 400,
      _debugHookTypes: ['useEffect'],
    })

    const fiber = makeFiber({
      type: { name: 'EffectComp' },
      memoizedProps: {},
      memoizedState: nextHook,
      alternate,
      _debugID: 400,
      _debugHookTypes: ['useEffect'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta[0].type, 'useEffect')
    assert.deepEqual(delta[0].deps, [1, 2])

    cleanup(observer)
  })

  it('does not emit a useEffect delta when deps are unchanged', () => {
    const { events, observer } = createObserver()

    const prevHook = makeHookNode({ deps: [1, 2] })
    const nextHook = makeHookNode({ deps: [1, 2] })

    const alternate = makeFiber({
      type: { name: 'EffectStable' },
      memoizedProps: { label: 'Stable' },
      memoizedState: prevHook,
      _debugID: 500,
      _debugHookTypes: ['useEffect'],
    })

    const fiber = makeFiber({
      type: { name: 'EffectStable' },
      memoizedProps: { label: 'Stable' },
      memoizedState: nextHook,
      alternate,
      _debugID: 500,
      _debugHookTypes: ['useEffect'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 0)

    cleanup(observer)
  })

  it('captures useMemo state and deps', () => {
    const { events, observer } = createObserver()

    const prevHook = makeHookNode(['cached', [1]])
    const nextHook = makeHookNode(['newCached', [1, 2]])

    const alternate = makeFiber({
      type: { name: 'MemoComp' },
      memoizedProps: {},
      memoizedState: prevHook,
      _debugID: 600,
      _debugHookTypes: ['useMemo'],
    })

    const fiber = makeFiber({
      type: { name: 'MemoComp' },
      memoizedProps: {},
      memoizedState: nextHook,
      alternate,
      _debugID: 600,
      _debugHookTypes: ['useMemo'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta[0].type, 'useMemo')
    assert.equal(delta[0].state, 'newCached')
    assert.deepEqual(delta[0].deps, [1, 2])

    cleanup(observer)
  })

  it('degrades gracefully in production mode', () => {
    const { events, observer } = createObserver()

    const prevHook = makeHookNode(0)
    const nextHook = makeHookNode(1)

    const alternate = makeFiber({
      type: { name: 'Counter' },
      memoizedProps: {},
      memoizedState: prevHook,
      _debugID: 700,
    })

    const fiber = makeFiber({
      type: { name: 'Counter' },
      memoizedProps: {},
      memoizedState: nextHook,
      alternate,
      _debugID: 700,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta[0].index, 0)
    assert.ok(!('type' in delta[0]))
    assert.equal(delta[0].state, 1)

    cleanup(observer)
  })

  it('emits an event for hook-only re-renders', () => {
    const { events, observer } = createObserver()

    const sharedProps = { label: 'Same' }
    const prevHook = makeHookNode(0)
    const nextHook = makeHookNode(1)

    const alternate = makeFiber({
      type: { name: 'StableProps' },
      memoizedProps: sharedProps,
      memoizedState: prevHook,
      _debugID: 800,
      _debugHookTypes: ['useState'],
    })

    const fiber = makeFiber({
      type: { name: 'StableProps' },
      memoizedProps: sharedProps,
      memoizedState: nextHook,
      alternate,
      _debugID: 800,
      _debugHookTypes: ['useState'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.notEqual(events[0]!.hooksDelta, '{}')

    cleanup(observer)
  })

  it('returns empty hooks delta when memoizedState is null', () => {
    const { events, observer } = createObserver()

    const fiber = makeFiber({
      type: { name: 'NoHooks' },
      memoizedProps: { a: 1 },
      memoizedState: null,
      alternate: null,
      _debugID: 900,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    assert.equal(events[0]!.hooksDelta, '{}')

    cleanup(observer)
  })

  it('guards against circular memoizedState chains', () => {
    const { events, observer } = createObserver()

    const node1 = makeHookNode(1)
    const node2 = makeHookNode(2)
    const node3 = makeHookNode(3)

    ;(node1 as any).next = node2
    ;(node2 as any).next = node3
    ;(node3 as any).next = node1

    const fiber = makeFiber({
      type: { name: 'Circular' },
      memoizedProps: { a: 1 },
      memoizedState: node1,
      alternate: null,
      _debugID: 1000,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)
    const delta = JSON.parse(events[0]!.hooksDelta)
    assert.equal(delta.length, 3)

    cleanup(observer)
  })

  it('skips events when hooksDelta exceeds the size limit', () => {
    const { events, observer } = createObserver()

    const hook = makeHookNode('x'.repeat(20_000))

    const fiber = makeFiber({
      type: { name: 'BigHooks' },
      memoizedProps: {},
      memoizedState: hook,
      alternate: null,
      _debugID: 1100,
      _debugHookTypes: ['useState'],
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 0)

    cleanup(observer)
  })

  it('preserves order and indices for multiple hooks', () => {
    const { events, observer } = createObserver()

    const hook3 = makeHookNode('memoized')
    const hook2 = makeHookNode({ deps: [1] })
    const hook1 = makeHookNode(42)

    ;(hook1 as any).next = hook2
    ;(hook2 as any).next = hook3

    const fiber = makeFiber({
      type: { name: 'MultiHook' },
      memoizedProps: {},
      memoizedState: hook1,
      alternate: null,
      _debugID: 1200,
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

    cleanup(observer)
  })
})
