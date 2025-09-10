import {
  DOMPatchEvent,
  NodeId,
  PatchType,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { BreakpointType, type Breakpoint } from '../types'

// FIXME: Return all matching breakpoints where multiple match
// TODO: Split into findMatchingAfterEvent and findMatchingBeforeEvent
// to better clarify which events are breaking.
export function findMatchingBreakpoint(
  previousEvent: SourceEvent | null,
  nextEvent: SourceEvent | null,
  breakpoints: Array<Breakpoint>
): Breakpoint | null {
  const matchingBreakpoints: Array<Breakpoint> = []

  if (previousEvent) {
    matchingBreakpoints.push(
      ...findMatchingBreakpointsAfterEvent(previousEvent, breakpoints)
    )
  }

  if (nextEvent) {
    matchingBreakpoints.push(
      ...findMatchingBreakpointsBeforeEvent(nextEvent, breakpoints)
    )
  }

  return matchingBreakpoints[0] ?? null
}

function findMatchingBreakpointsWithSelector(
  event: SourceEvent,
  breakpoints: Array<Breakpoint>,
  selectTargetNodeIds: (event: SourceEvent) => Array<NodeId>
): Array<Breakpoint> {
  if (breakpoints.length === 0) {
    return []
  }

  const targetIds = selectTargetNodeIds(event)
  const matchingBreakpoints: Array<Breakpoint> = []

  for (const targetId of targetIds) {
    for (const breakpoint of breakpoints) {
      if (
        breakpoint.type === BreakpointType.VNode &&
        breakpoint.nodeId === targetId
      ) {
        matchingBreakpoints.push(breakpoint)
      }
    }
  }

  return matchingBreakpoints
}

export function findMatchingBreakpointsBeforeEvent(
  event: SourceEvent,
  breakpoints: Array<Breakpoint>
): Array<Breakpoint> {
  return findMatchingBreakpointsWithSelector(event, breakpoints, event => {
    const targetIds: Array<NodeId> = []

    const domPatch = event
      .filter<DOMPatchEvent>(event => event.type === SourceEventType.DOMPatch)
      .flatMap(event => event.data)

    domPatch.apply(domPatch => {
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

    return targetIds
  })
}

export function findMatchingBreakpointsAfterEvent(
  event: SourceEvent,
  breakpoints: Array<Breakpoint>
): Array<Breakpoint> {
  return findMatchingBreakpointsWithSelector(event, breakpoints, event => {
    const targetIds: Array<NodeId> = []

    const domPatch = event
      .filter<DOMPatchEvent>(event => event.type === SourceEventType.DOMPatch)
      .flatMap(event => event.data)

    domPatch.apply(domPatch => {
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

    return targetIds
  })
}
