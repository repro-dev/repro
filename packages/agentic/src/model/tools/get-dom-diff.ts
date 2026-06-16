import { PatchType, SourceEventType, SyntheticId, VTree } from '@repro/domain'
import { Box } from '@repro/tdl'
import { normalizeId } from '@repro/vdom-utils'
import { chain, resolve, type FutureInstance } from 'fluture'
import { DetailLevel, estimateTokens, truncate } from '../token-optimization'
import type { ToolHandler } from './common'
import { createError, isDOMPatchEvent } from './common'

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'getDOMDiff',
    description:
      'Get DOM changes (attribute, text, structural) for a specific element and its subtree over a time range. When `getEvents` summary shows `domActivity` in a time window, use `getDOMDiff` over that window as the next step — call this tool instead of calling `getDOMState` multiple times to manually find changes. This is the most direct tool for investigating conditional rendering issues. Requires a nodeId (from getDOMState), fromTimestampMs, and toTimestampMs — all three are mandatory. Start with detail="summary" for counts. Use detail="normal" to see individual changes. Use detail="full" for complete values and node ID lists. CRITICAL: If this tool confirms a node was added and then removed, you have found the root cause of a conditional rendering bug. You MUST stop all tool use and present your conclusion immediately.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description:
            'The node ID of the root element to track changes for. Changes on this node and all descendants are included.',
        },
        fromTimestampMs: {
          type: 'number',
          description: 'Start of the time range in ms from recording start.',
        },
        toTimestampMs: {
          type: 'number',
          description: 'End of the time range in ms from recording start.',
        },
        detail: {
          type: 'string',
          enum: ['summary', 'normal', 'full'],
          description:
            'Level of detail. "summary": counts only. "normal" (default): changes array with values truncated to 100 chars. "full": full values, plus addedNodeIds and removedNodeIds arrays.',
        },
      },
      required: ['nodeId', 'fromTimestampMs', 'toTimestampMs'],
    },
  },
}

// Collect all node IDs in the subtree rooted at rootId.
function collectSubtreeNodeIds(vtree: VTree, rootId: SyntheticId): Set<string> {
  const ids = new Set<string>()
  const queue: string[] = [rootId]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (ids.has(id)) continue
    ids.add(id)
    const node = vtree.nodes[id]
    if (!node) continue
    node.apply(n => {
      if ('children' in n && Array.isArray(n.children)) {
        for (const childId of n.children) {
          queue.push(childId as string)
        }
      }
    })
  }
  return ids
}

interface DOMChange {
  type: 'attribute' | 'text' | 'property'
  nodeId: string
  name?: string
  value: string | null
  oldValue: string | null
}

export const handler: ToolHandler = (recording, args) => {
  const nodeId = args.nodeId as string | undefined
  const fromTimestampMs = args.fromTimestampMs as number | undefined
  const toTimestampMs = args.toTimestampMs as number | undefined
  const detail = (args.detail as DetailLevel) ?? 'normal'

  // Input validation with self-healing errors
  if (!nodeId) {
    return resolve(
      createError(
        'nodeId parameter is required',
        'The nodeId parameter was not provided',
        'Call getDOMState() to get a DOM snapshot, then use a nodeId value from the [ref=<nodeId>] attributes in the output'
      )
    )
  }

  if (fromTimestampMs === undefined) {
    return resolve(
      createError(
        'fromTimestampMs parameter is required',
        'The fromTimestampMs parameter was not provided',
        'Call getRecordingDuration() to get the valid recording time range, then provide a start timestamp'
      )
    )
  }

  if (toTimestampMs === undefined) {
    return resolve(
      createError(
        'toTimestampMs parameter is required',
        'The toTimestampMs parameter was not provided',
        'Call getRecordingDuration() to get the valid recording time range, then provide an end timestamp'
      )
    )
  }

  if (fromTimestampMs >= toTimestampMs) {
    return resolve(
      createError(
        'Invalid time range: fromTimestampMs must be less than toTimestampMs',
        'The provided timestamp range is empty or reversed',
        'Call getRecordingDuration() to get the valid recording time range, then provide a non-empty range'
      )
    )
  }

  return recording.getSnapshotAtTime(fromTimestampMs).pipe(
    chain((snapshot): FutureInstance<Error, Record<string, unknown>> => {
      if (!snapshot || !snapshot.dom) {
        return resolve(
          createError(
            'No DOM snapshot available at the specified time',
            'The timestamp may be outside the recording range or no DOM snapshot was captured at this point',
            'Call getRecordingDuration() to get the valid recording time range, then retry with a timestamp within that range'
          )
        )
      }

      const vtree = snapshot.dom as VTree

      // Verify the target node exists in the snapshot
      if (!vtree.nodes[nodeId as SyntheticId]) {
        return resolve(
          createError(
            `Element with nodeId "${nodeId}" not found in the DOM snapshot`,
            'The nodeId may be stale, from a different timestamp, or the element may not yet exist at this point in the recording',
            'Call getDOMState() at the same timestamp to get fresh nodeId values from the current DOM snapshot'
          )
        )
      }

      // Build initial set of node IDs in the target subtree
      const scopeIds = collectSubtreeNodeIds(vtree, nodeId as SyntheticId)

      // Fetch DOMPatch events in the time range
      return recording
        .getEventsByType([SourceEventType.DOMPatch], {
          startMs: fromTimestampMs,
          endMs: toTimestampMs,
        })
        .pipe(
          chain(
            (patchEvents): FutureInstance<never, Record<string, unknown>> => {
              // Counters and change accumulation
              let attributeChanges = 0
              let textChanges = 0
              let propertyChanges = 0
              let nodesAdded = 0
              let nodesRemoved = 0
              const changes: DOMChange[] = []
              const addedNodeIds: string[] = []
              const removedNodeIds: string[] = []

              for (const event of patchEvents) {
                if (!isDOMPatchEvent(event)) continue

                // DOMPatchEvent.data is a union type, so after encoding/decoding it is
                // double-wrapped as Box<Box<DOMPatch>>. Use .flat() to unwrap the outer
                // Box and get a Box<DOMPatch> whose .get() calls work correctly.
                const eventBox = event as Box<{
                  type: number
                  time: number
                  data: Box<{ type: PatchType }>
                }>
                const dataBox = eventBox.get('data').flat() as Box<{
                  type: PatchType
                  targetId?: SyntheticId
                  parentId?: SyntheticId
                  name?: string
                  value?: string | null
                  oldValue?: string | null
                  nodes?: Array<{
                    rootId: SyntheticId
                    nodes: Record<string, unknown>
                  }>
                }>

                const patchType = dataBox.get('type').orElse(-1 as PatchType)

                if (patchType === PatchType.Attribute) {
                  // Null-terminate strings are stripped: binary codec pads fixed-width
                  // string fields with null bytes that must be removed for Set membership.
                  const targetId = normalizeId(
                    dataBox.get('targetId').orElse('' as SyntheticId) as string
                  )
                  if (!scopeIds.has(targetId)) continue
                  attributeChanges++
                  if (detail !== 'summary') {
                    const name = dataBox.get('name').orElse('')
                    const rawValue = dataBox.get('value').orElse(null)
                    const rawOldValue = dataBox.get('oldValue').orElse(null)
                    const value =
                      typeof rawValue === 'string' && detail === 'normal'
                        ? truncate(rawValue, 100)
                        : rawValue ?? null
                    const oldValue =
                      typeof rawOldValue === 'string' && detail === 'normal'
                        ? truncate(rawOldValue, 100)
                        : rawOldValue ?? null
                    changes.push({
                      type: 'attribute',
                      nodeId: targetId,
                      name,
                      value,
                      oldValue,
                    })
                  }
                } else if (patchType === PatchType.Text) {
                  const targetId = normalizeId(
                    dataBox.get('targetId').orElse('' as SyntheticId) as string
                  )
                  if (!scopeIds.has(targetId)) continue
                  textChanges++
                  if (detail !== 'summary') {
                    const rawValue = dataBox.get('value').orElse(null) as
                      | string
                      | null
                    const rawOldValue = dataBox.get('oldValue').orElse(null) as
                      | string
                      | null
                    const value =
                      typeof rawValue === 'string' && detail === 'normal'
                        ? truncate(rawValue, 100)
                        : rawValue
                    const oldValue =
                      typeof rawOldValue === 'string' && detail === 'normal'
                        ? truncate(rawOldValue, 100)
                        : rawOldValue
                    changes.push({
                      type: 'text',
                      nodeId: targetId,
                      value,
                      oldValue,
                    })
                  }
                } else if (
                  patchType === PatchType.TextProperty ||
                  patchType === PatchType.BooleanProperty ||
                  patchType === PatchType.NumberProperty
                ) {
                  const targetId = normalizeId(
                    dataBox.get('targetId').orElse('' as SyntheticId) as string
                  )
                  if (!scopeIds.has(targetId)) continue
                  propertyChanges++
                  if (detail !== 'summary') {
                    const name = dataBox.get('name').orElse('')
                    const rawValue = dataBox.get('value').orElse(null)
                    const rawOldValue = dataBox.get('oldValue').orElse(null)
                    const value =
                      typeof rawValue === 'string' && detail === 'normal'
                        ? truncate(rawValue, 100)
                        : rawValue != null
                        ? String(rawValue)
                        : null
                    const oldValue =
                      typeof rawOldValue === 'string' && detail === 'normal'
                        ? truncate(rawOldValue, 100)
                        : rawOldValue != null
                        ? String(rawOldValue)
                        : null
                    changes.push({
                      type: 'property',
                      nodeId: targetId,
                      name,
                      value,
                      oldValue,
                    })
                  }
                } else if (patchType === PatchType.AddNodes) {
                  const parentId = normalizeId(
                    dataBox.get('parentId').orElse('' as SyntheticId) as string
                  )
                  // Only track additions under nodes in our scope
                  if (!scopeIds.has(parentId)) continue
                  const addedNodes = dataBox.get('nodes').orElse([]) as Array<{
                    rootId: string
                  }>
                  for (const vt of addedNodes) {
                    const addedId = normalizeId(vt.rootId as string)
                    nodesAdded++
                    // Expand scope to include newly added nodes so subsequent patches on
                    // them are also tracked within this diff window
                    scopeIds.add(addedId)
                    if (detail === 'full') {
                      addedNodeIds.push(addedId)
                    }
                  }
                } else if (patchType === PatchType.RemoveNodes) {
                  const parentId = normalizeId(
                    dataBox.get('parentId').orElse('' as SyntheticId) as string
                  )
                  if (!scopeIds.has(parentId)) continue
                  const removedNodes = dataBox
                    .get('nodes')
                    .orElse([]) as Array<{
                    rootId: string
                  }>
                  for (const vt of removedNodes) {
                    const removedId = normalizeId(vt.rootId as string)
                    nodesRemoved++
                    scopeIds.delete(removedId)
                    if (detail === 'full') {
                      removedNodeIds.push(removedId)
                    }
                  }
                }
              }

              if (detail === 'summary') {
                const result: Record<string, unknown> = {
                  attributeChanges,
                  textChanges,
                  propertyChanges,
                  nodesAdded,
                  nodesRemoved,
                }
                return resolve({
                  ...result,
                  _tokenEstimate: estimateTokens(result),
                })
              }

              const result: Record<string, unknown> = {
                attributeChanges,
                textChanges,
                propertyChanges,
                nodesAdded,
                nodesRemoved,
                changes,
              }

              if (detail === 'full') {
                result.addedNodeIds = addedNodeIds
                result.removedNodeIds = removedNodeIds
              }

              return resolve({
                ...result,
                _tokenEstimate: estimateTokens(result),
              })
            }
          )
        )
    })
  )
}
