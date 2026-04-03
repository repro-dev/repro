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

// Max depth for safe serialisation
const MAX_SERIALISE_DEPTH = 3

interface Fiber {
  tag: number
  type?: { displayName?: string; name?: string } | null
  memoizedProps: Record<string, unknown> | null
  alternate: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  return: Fiber | null
  _debugID?: number
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

// Safe JSON serialiser with depth limit, circular ref guard, and type coercion
function safeSerialise(value: unknown): string {
  try {
    const seen = new Set<object>()

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
  getComponentTree(): ReactComponentTree
  resetComponentTree(): void
} {
  // Instance-scoped state — no module-level singletons
  let commitBatchCounter = 0
  const componentTree = new Map<number, ReactComponentNode>()

  let originalOnCommitFiberRoot:
    | ReactDevToolsHook['onCommitFiberRoot']
    | undefined
  let hookCreatedByUs = false

  function handleCommit(
    _rendererID: number,
    root: { current: Fiber },
    _priorityLevel: unknown
  ) {
    // Increment batch ID once per commit — all events in this walk share the same value
    const currentBatchId = ++commitBatchCounter

    walkFiber(root.current, fiber => {
      // Only track component fiber tags
      if (!TRACKED_TAGS.has(fiber.tag)) return

      const name = getDisplayName(fiber)
      if (!name) return

      const changedProps = getChangedProps(fiber.alternate, fiber)
      if (!changedProps) return

      const propsDelta = safeSerialise(changedProps)
      if (propsDelta.length > MAX_PROPS_DELTA_SIZE) return

      const event: ReactCommitEvent = {
        type: StateEventType.ReactCommit,
        time: Date.now(),
        frameId: 0,
        componentName: name,
        propsDelta,
        hooksDelta: '',
        // _debugID may be undefined on untracked fibers; fall back to 0
        fiberNodeId: fiber._debugID ?? 0,
        parentFiberId: getParentFiberId(fiber),
        commitBatchId: currentBatchId,
      }

      subscriber(event)

      // Maintain running component tree (skip unknown fiber IDs)
      if (event.fiberNodeId !== 0) {
        componentTree.set(event.fiberNodeId, {
          fiberNodeId: event.fiberNodeId,
          // parentFiberId is nullable in the event but required in the node; default to 0 (no parent)
          parentFiberId: event.parentFiberId ?? 0,
          componentName: event.componentName,
          props: event.propsDelta,
        })
      }
    })
  }

  return {
    observe(_target: unknown, _vtree: VTree) {
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
    },

    disconnect() {
      const hook = (globalThis as Record<string, unknown>)[
        '__REACT_DEVTOOLS_GLOBAL_HOOK__'
      ] as ReactDevToolsHook | undefined

      if (!hook) return

      if (hookCreatedByUs) {
        delete (globalThis as Record<string, unknown>)[
          '__REACT_DEVTOOLS_GLOBAL_HOOK__'
        ]
        hookCreatedByUs = false
      } else if (originalOnCommitFiberRoot !== undefined) {
        hook.onCommitFiberRoot = originalOnCommitFiberRoot
        originalOnCommitFiberRoot = undefined
      }

      // Reset tree on disconnect so stale nodes don't accumulate across recordings
      componentTree.clear()
      commitBatchCounter = 0
    },

    // Returns a snapshot of the current accumulated component tree.
    // Called at snapshot emit time by createRecordingStream.
    // Keys are string-serialised fiberNodeIds for map<string, ReactComponentNode> compatibility.
    getComponentTree() {
      const tree: ReactComponentTree = {}
      for (const [id, node] of componentTree.entries()) {
        tree[String(id)] = node
      }
      return tree
    },

    resetComponentTree() {
      componentTree.clear()
    },
  }
}
