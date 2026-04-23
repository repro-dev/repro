import {
  ReactCommitEvent,
  ReactComponentNode,
  ReactComponentTree,
  StateEventType,
  VTree,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'

// Fiber tags we care about: FunctionComponent, ClassComponent, ForwardRef
const TRACKED_TAGS = new Set([0, 1, 11])

// Max serialised propsDelta size in characters
const MAX_PROPS_DELTA_SIZE = 10_000

// Max serialised hooksDelta size in characters
const MAX_HOOKS_DELTA_SIZE = 10_000

// Max hooks to walk in a single fiber
const MAX_HOOKS = 100

// Max depth for safe serialisation
const MAX_SERIALISE_DEPTH = 3

interface Fiber {
  tag: number
  type?: { displayName?: string; name?: string } | null
  memoizedProps: Record<string, unknown> | null
  memoizedState: unknown
  alternate: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  return: Fiber | null
  _debugID?: number
  _debugHookTypes?: string[]
}

interface ReactDevToolsHook {
  onCommitFiberRoot: (
    rendererID: number,
    root: { current: Fiber },
    priorityLevel: unknown
  ) => void
  isDisabled?: boolean
  inject?: (...args: unknown[]) => unknown
  _renderers?: Record<string, unknown>
  helpers?: Record<string, unknown>
  onCommitFiberUnmount?: (...args: unknown[]) => void
  onPostCommitFiberRoot?: (...args: unknown[]) => void
  [key: string]: unknown
}

// Traverse the fiber tree depth-first using child/sibling pointers
function walkFiber(fiber: Fiber, cb: (f: Fiber) => void) {
  let node: Fiber | null = fiber
  while (node) {
    cb(node)
    if (node.child) {
      node = node.child
      continue
    }
    if (node === fiber) return
    while (!node.sibling) {
      if (!node.return || node.return === fiber) return
      node = node.return
    }
    node = node.sibling
  }
}

// Extract a human-readable display name from a fiber
function getDisplayName(fiber: Fiber): string | null {
  const { type, tag } = fiber
  switch (tag) {
    case 0: // FunctionComponent
    case 11: // ForwardRef
    case 1: // ClassComponent
      return type?.displayName ?? type?.name ?? null
    default:
      return null
  }
}

// Build a record of changed props (excluding children)
function getChangedProps(
  prevFiber: Fiber | null,
  nextFiber: Fiber
): Record<string, unknown> | null {
  const next = nextFiber.memoizedProps
  const prev = prevFiber?.memoizedProps ?? {}
  if (!next) return null

  const changed: Record<string, unknown> = {}
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)])

  for (const key of allKeys) {
    if (key === 'children') continue
    if (!Object.is(prev[key], next[key])) {
      changed[key] = next[key]
    }
  }

  return Object.keys(changed).length > 0 ? changed : null
}

// Walk up fiber.return to find the nearest ancestor component fiber's _debugID.
// Skips host elements, context providers, and other non-component fiber types.
// Uses !== undefined rather than truthiness so that _debugID = 0 is not skipped.
function getParentFiberId(fiber: Fiber): number | null {
  let parent = fiber.return
  while (parent) {
    if (TRACKED_TAGS.has(parent.tag) && parent._debugID !== undefined) {
      return parent._debugID
    }
    parent = parent.return
  }
  return null
}

// Guard to distinguish hook linked lists from class-component state objects.
// A class state object that happens to contain a .next field would be mis-walked,
// but this is extremely unlikely in practice.
function isHookList(head: unknown): boolean {
  if (head === null || typeof head !== 'object') return false
  const next = (head as Record<string, unknown>).next
  return next === null || (typeof next === 'object' && next !== null)
}

// Walk fiber.memoizedState as a singly-linked list and build a delta of
// hooks whose memoizedState changed vs. the alternate fiber.
function getHooksDelta(fiber: Fiber): string {
  if (!isHookList(fiber.memoizedState)) return '{}'

  const deltas: Array<Record<string, unknown>> = []
  const seen = new Set<unknown>()
  let node: unknown = fiber.memoizedState
  let prevNode: unknown = fiber.alternate?.memoizedState ?? null
  let index = 0

  while (node && index < MAX_HOOKS) {
    if (seen.has(node)) break
    seen.add(node)

    const hookNode = node as { memoizedState: unknown; next: unknown }
    const prevHookNode =
      prevNode && isHookList(prevNode)
        ? (prevNode as { memoizedState: unknown; next: unknown })
        : null

    const changed =
      prevHookNode === null ||
      !Object.is(hookNode.memoizedState, prevHookNode.memoizedState)

    if (changed) {
      const type = fiber._debugHookTypes?.[index]
      const entry: Record<string, unknown> = { index }
      if (type !== undefined) entry.type = type

      if (
        type === 'useEffect' ||
        type === 'useLayoutEffect' ||
        type === 'useInsertionEffect'
      ) {
        const effect = hookNode.memoizedState as { deps?: unknown[] } | null
        if (effect && typeof effect === 'object' && 'deps' in effect) {
          entry.deps = effect.deps
        }
      } else if (type === 'useMemo' || type === 'useCallback') {
        const arr = hookNode.memoizedState as [unknown, unknown[]] | null
        if (Array.isArray(arr) && arr.length >= 2) {
          entry.state = arr[0]
          entry.deps = arr[1]
        } else {
          entry.state = hookNode.memoizedState
        }
      } else {
        entry.state = hookNode.memoizedState
      }

      deltas.push(entry)
    }

    node = hookNode.next
    prevNode = prevHookNode ? prevHookNode.next : null
    index++
  }

  if (deltas.length === 0) return '{}'
  return safeSerialise(deltas)
}

// Safe JSON serialiser with depth limit, circular ref guard, and type coercion
function safeSerialise(value: unknown): string {
  try {
    const seen = new Set()

    function replacer(val: unknown, depth: number): unknown {
      if (depth > MAX_SERIALISE_DEPTH) return '[object ...]'
      if (typeof val === 'function') return '[function]'
      if (val === null || typeof val !== 'object') return val

      if (seen.has(val)) return '[circular]'
      seen.add(val)

      // Detect class instances (not plain objects)
      const proto = Object.getPrototypeOf(val)
      if (proto !== Object.prototype && proto !== null && !Array.isArray(val)) {
        seen.delete(val)
        return `[object ${(val as object).constructor?.name ?? 'Object'}]`
      }

      if (Array.isArray(val)) {
        const result = val.map(item => replacer(item, depth + 1))
        seen.delete(val)
        return result
      }

      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        result[k] = replacer(v, depth + 1)
      }
      seen.delete(val)
      return result
    }

    return JSON.stringify(replacer(value, 0)) ?? '{}'
  } catch {
    return '{}'
  }
}

export function createReactObserver(
  subscriber: (event: ReactCommitEvent) => void
): ObserverLike & {
  getComponentTree(): ReactComponentTree | null
  resetComponentTree(): void
} {
  // Instance-scoped state — no module-level singletons
  let commitBatchCounter = 0
  const componentTree = new Map()
  let rootFiberId: number | null = null

  // Idempotency guard — prevents double-wrapping the DevTools hook when
  // observe() is called more than once (e.g. for iframes in the same session)
  let isObserving = false

  let originalOnCommitFiberRoot:
    | ReactDevToolsHook['onCommitFiberRoot']
    | undefined
  let hookCreatedByUs = false

  function resetReactRecordingState() {
    commitBatchCounter = 0
    componentTree.clear()
    rootFiberId = null
  }

  function handleCommit(
    _rendererID: number,
    root: { current: Fiber },
    _priorityLevel: unknown
  ) {
    // Increment batch ID once per commit — all events in this walk share the same value
    const currentBatchId = ++commitBatchCounter

    // Capture root fiber ID from the root current fiber
    if (rootFiberId === null && root.current._debugID !== undefined) {
      rootFiberId = root.current._debugID
    }

    walkFiber(root.current, fiber => {
      // Only track component fiber tags
      if (!TRACKED_TAGS.has(fiber.tag)) return

      const name = getDisplayName(fiber)
      if (!name) return

      const fiberNodeId = fiber._debugID ?? 0
      const parentFiberId = getParentFiberId(fiber)

      // Always record every tracked fiber in the tree so the snapshot is
      // complete even for components whose props haven't changed this commit.
      // Skip sentinel ID 0 (fiber without _debugID).
      if (fiberNodeId !== 0) {
        // Preserve existing props if this fiber had no changes in this commit;
        // only overwrite when changedProps are available below.
        const existing = componentTree.get(fiberNodeId)
        componentTree.set(fiberNodeId, {
          fiberNodeId,
          parentFiberId,
          componentName: name,
          props: existing?.props ?? '',
        })
      }

      // Event emission is gated on prop or hook changes to limit event volume
      const changedProps = getChangedProps(fiber.alternate, fiber)
      const hooksDeltaStr = getHooksDelta(fiber)
      if (!changedProps && hooksDeltaStr === '{}') return

      const propsDelta = changedProps ? safeSerialise(changedProps) : '{}'
      if (propsDelta.length > MAX_PROPS_DELTA_SIZE) return
      if (hooksDeltaStr.length > MAX_HOOKS_DELTA_SIZE) return

      const event: ReactCommitEvent = {
        type: StateEventType.ReactCommit,
        time: Date.now(),
        frameId: 0,
        componentName: name,
        propsDelta,
        hooksDelta: hooksDeltaStr,
        // _debugID may be undefined on untracked fibers; fall back to 0
        fiberNodeId,
        parentFiberId,
        commitBatchId: currentBatchId,
      }

      subscriber(event)

      // Update tree node with latest propsDelta from this commit
      if (fiberNodeId !== 0) {
        componentTree.set(fiberNodeId, {
          fiberNodeId,
          parentFiberId,
          componentName: name,
          props: propsDelta,
        })
      }
    })
  }

  return {
    observe(_target: unknown, _vtree: VTree) {
      // Idempotency: a second call (e.g. for an iframe) must not wrap again
      if (isObserving) return

      // Reset accumulated state so each new session starts clean
      resetReactRecordingState()

      const existing = (globalThis as Record<string, unknown>)[
        '__REACT_DEVTOOLS_GLOBAL_HOOK__'
      ] as ReactDevToolsHook | undefined

      if (existing) {
        // Preserve the original and wrap it
        originalOnCommitFiberRoot = existing.onCommitFiberRoot
        hookCreatedByUs = false

        existing.onCommitFiberRoot = (rendererID, root, priorityLevel) => {
          originalOnCommitFiberRoot?.(rendererID, root, priorityLevel)
          handleCommit(rendererID, root, priorityLevel)
        }
      } else {
        // Create a minimal hook stub
        hookCreatedByUs = true
        ;(globalThis as Record<string, unknown>)[
          '__REACT_DEVTOOLS_GLOBAL_HOOK__'
        ] = {
          isDisabled: false,
          inject: () => {},
          _renderers: {},
          helpers: {},
          onCommitFiberUnmount: () => {},
          onPostCommitFiberRoot: () => {},
          onCommitFiberRoot: handleCommit,
        } satisfies ReactDevToolsHook
      }

      isObserving = true
    },

    disconnect() {
      const hook = (globalThis as Record<string, unknown>)[
        '__REACT_DEVTOOLS_GLOBAL_HOOK__'
      ] as ReactDevToolsHook | undefined

      if (hook) {
        if (hookCreatedByUs) {
          delete (globalThis as Record<string, unknown>)[
            '__REACT_DEVTOOLS_GLOBAL_HOOK__'
          ]
          hookCreatedByUs = false
        } else if (originalOnCommitFiberRoot !== undefined) {
          hook.onCommitFiberRoot = originalOnCommitFiberRoot
          originalOnCommitFiberRoot = undefined
        }
      }

      // Always reset observing flag and accumulated state, even if the hook was
      // externally removed — ensures re-attach works regardless of cleanup order
      isObserving = false
      resetReactRecordingState()
    },

    // Returns a snapshot of the current accumulated component tree, or null if no root seen yet.
    // Called at snapshot emit time by createRecordingStream.
    // Keys are string-serialised fiberNodeIds for map<string, ReactComponentNode> compatibility.
    getComponentTree(): ReactComponentTree | null {
      if (rootFiberId === null) return null
      const nodes: Record<string, ReactComponentNode> = {}
      for (const [id, node] of componentTree.entries()) {
        nodes[String(id)] = node
      }
      return { rootId: rootFiberId, nodes }
    },

    resetComponentTree() {
      componentTree.clear()
    },
  }
}
