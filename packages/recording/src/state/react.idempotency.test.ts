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

function makeFiberRoot(current: MockFiber) {
  return { current }
}

function simulateCommit(rendererID: number, root: { current: MockFiber }) {
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  if (hook?.onCommitFiberRoot) {
    hook.onCommitFiberRoot(rendererID, root, undefined)
  }
}

describe('idempotency and re-attach (REP-729)', () => {
  it('calling observe() twice does not double-wrap the hook', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: unknown[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })
    observer.observe(null as any, null as any)
    observer.observe(null as any, null as any)

    const fiber = makeFiber({
      type: { name: 'Widget' },
      memoizedProps: { x: 1 },
      alternate: null,
      _debugID: 4001,
    })

    simulateCommit(1, makeFiberRoot(fiber))

    assert.equal(events.length, 1)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('after disconnect(), observe() can re-attach and receives commits', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: unknown[] = []
    const observer = createReactObserver(event => {
      events.push(event)
    })

    observer.observe(null as any, null as any)
    const fiber1 = makeFiber({
      type: { name: 'Session1' },
      memoizedProps: { s: 1 },
      alternate: null,
      _debugID: 5001,
    })
    simulateCommit(1, makeFiberRoot(fiber1))
    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    assert.equal(events.length, 1)

    observer.observe(null as any, null as any)
    const fiber2 = makeFiber({
      type: { name: 'Session2' },
      memoizedProps: { s: 2 },
      alternate: null,
      _debugID: 5002,
    })
    simulateCommit(1, makeFiberRoot(fiber2))

    assert.equal(events.length, 2)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('componentTree and commitBatchCounter are reset when re-attaching after disconnect', () => {
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    const events: Array<{ commitBatchId?: number | null }> = []
    const observer = createReactObserver(event => {
      events.push({ commitBatchId: event.commitBatchId })
    })

    observer.observe(null as any, null as any)
    const fiber1 = makeFiber({
      type: { name: 'OldComp' },
      memoizedProps: { v: 1 },
      alternate: null,
      _debugID: 6001,
    })
    simulateCommit(1, makeFiberRoot(fiber1))
    simulateCommit(1, makeFiberRoot(fiber1))

    const batchIdBeforeDisconnect =
      events[events.length - 1]?.commitBatchId ?? 0
    assert.ok(batchIdBeforeDisconnect >= 2)
    assert.ok(observer.getComponentTree() !== null)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    observer.observe(null as any, null as any)
    assert.equal(observer.getComponentTree(), null)

    const fiber2 = makeFiber({
      type: { name: 'NewComp' },
      memoizedProps: { v: 2 },
      alternate: null,
      _debugID: 6002,
    })
    simulateCommit(1, makeFiberRoot(fiber2))

    assert.equal(events[events.length - 1]?.commitBatchId, 1)

    observer.disconnect()
    delete (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  })
})
