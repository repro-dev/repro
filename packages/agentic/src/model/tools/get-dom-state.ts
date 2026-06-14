import { NodeType } from '@repro/domain'
import { Box } from '@repro/tdl'
import { buildA11yTree, formatA11yTree } from '@repro/vdom-utils'
import { chain, resolve, type FutureInstance } from 'fluture'
import { estimateTokens } from '../token-optimization'
import type { ToolHandler } from './common'
import { createError } from './common'

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'getDOMState',
    description:
      "Get the state of the DOM at a specific timestamp, either as an accessibility tree (a11y mode) or a summary of element counts (summary mode). Only works when the recording contains DOM snapshots — recordings that capture only console and network events will not have snapshots and this tool will return an error. Check for the presence of domSnapshot events via getEvents(detail='summary') before using this tool. CRITICAL: Do not call this tool multiple times with different timestamps to manually compare changes. This is an incorrect use of the tool. Use getDOMDiff to find what changed over a time range.",
    parameters: {
      type: 'object',
      properties: {
        timestampMs: {
          type: 'number',
          description:
            'Timestamp in milliseconds from the start of the recording.',
        },
        mode: {
          type: 'string',
          enum: ['a11y', 'summary'],
          default: 'a11y',
          description:
            'The mode for DOM state output. Use "a11y" for accessibility tree, "summary" for element counts.',
        },
      },
    },
  },
}

export const handler: ToolHandler = (recording, args) => {
  const timestampMs = (args.timestampMs as number) ?? 0
  const mode = (args.mode as string) ?? 'a11y'

  return recording.getSnapshotAtTime(timestampMs).pipe(
    chain((snapshot): FutureInstance<never, Record<string, unknown>> => {
      if (!snapshot || !snapshot.dom) {
        const err = createError(
          'No DOM snapshot available at this timestamp',
          'The timestamp may be outside the recording range or no DOM snapshot was captured at this point',
          'Call getRecordingDuration() to get the valid recording time range, then retry with a timestamp within that range'
        )
        return resolve({ ...err, _tokenEstimate: estimateTokens(err) })
      }

      const vtree = snapshot.dom

      if (mode === 'a11y') {
        const tree = buildA11yTree(vtree)

        if (!tree) {
          const err = createError(
            'Could not build accessibility tree',
            'The DOM snapshot may be incomplete or corrupted at this timestamp',
            'Retry with mode: "summary" for a lighter-weight view, or try a different timestamp using getRecordingDuration() to find a valid range'
          )
          return resolve({ ...err, _tokenEstimate: estimateTokens(err) })
        }

        const formatted = formatA11yTree(tree)
        const result = { mode: 'a11y' as const, tree: formatted, timestampMs }
        return resolve({ ...result, _tokenEstimate: estimateTokens(result) })
      }

      let elementCount = 0
      let textCount = 0
      const tagCounts: Record<string, number> = {}

      for (const node of Object.values(vtree.nodes)) {
        if (node.match(n => n.type === NodeType.Element)) {
          elementCount++
          const tagName = (
            node as Box<{ type: typeof NodeType.Element; tagName: string }>
          )
            .get('tagName')
            .orElse('unknown')
          tagCounts[tagName] = (tagCounts[tagName] ?? 0) + 1
        } else if (node.match(n => n.type === NodeType.Text)) {
          textCount++
        }
      }

      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }))

      const result = {
        mode: 'summary' as const,
        elementCount,
        textCount,
        topTags,
        timestampMs,
      }
      return resolve({ ...result, _tokenEstimate: estimateTokens(result) })
    })
  )
}
