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
  __repro_installed?: true
  isDisabled?: boolean
  supportsFiber?: boolean
  inject?: (...args: unknown[]) => number
  renderers?: Map<number, unknown>
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

  // Renderer ID counter and Map used by the fallback stub's inject() fn
  let rendererIdCounter = 0
  const renderers = new Map<number, unknown>()

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

      // Event emission is still gated on prop changes to limit event volume
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
          __repro_installed: true,
          isDisabled: false,
          supportsFiber: true,
          renderers,
          inject: () => {
            const id = ++rendererIdCounter
            renderers.set(id, {})
            return id
          },
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
