import {
  DOMPatchEvent,
  NodeId,
  PatchType,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { BreakpointType, type Breakpoint } from '../types'

// FIXME: Return all matching breakpoints where multiple match
export function findMatchingBreakpoint(
  previousEvent: SourceEvent | null,
  nextEvent: SourceEvent | null,
  breakpoints: Array<Breakpoint>
): Breakpoint | null {
  if (breakpoints.length === 0) {
    return null
  }

  let targetIds: Array<NodeId> = []

  if (previousEvent) {
    const previousDOMPatch = previousEvent
      .filter<DOMPatchEvent>(event => event.type === SourceEventType.DOMPatch)
      .flatMap(event => event.data)

    previousDOMPatch.apply(domPatch => {
      switch (domPatch.type) {
        case PatchType.AddNodes: {
          // Break **after** nodes are added
          targetIds.push(domPatch.parentId)

          for (const subtree of domPatch.nodes) {
            targetIds.push(...Object.keys(subtree.nodes))
          }

          break
        }

        case PatchType.Attribute:
        case PatchType.BooleanProperty:
        case PatchType.NumberProperty:
        case PatchType.TextProperty:
          targetIds.push(domPatch.targetId)
          break

        case PatchType.Text:
          targetIds.push(domPatch.targetId)

          if (domPatch.parentId) {
            targetIds.push(domPatch.parentId)
          }
          break

        default:
          break
      }
    })
  }

  if (nextEvent) {
    const nextDOMPatch = nextEvent
      .filter<DOMPatchEvent>(event => event.type === SourceEventType.DOMPatch)
      .flatMap(event => event.data)

    nextDOMPatch.apply(domPatch => {
      switch (domPatch.type) {
        case PatchType.RemoveNodes: {
          // Break **before** nodes are removed
          targetIds.push(domPatch.parentId)

          for (const subtree of domPatch.nodes) {
            targetIds.push(...Object.keys(subtree.nodes))
          }
          break
        }

        default:
          break
      }
    })
  }

  for (const targetId of targetIds) {
    for (const breakpoint of breakpoints) {
      if (
        breakpoint.type === BreakpointType.VNode &&
        breakpoint.nodeId === targetId
      ) {
        return breakpoint
      }
    }
  }

  return null
}
