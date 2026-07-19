import { buildLayoutSummary, formatLayoutSummary } from '@repro/vdom-utils'
import { chain, resolve, type FutureInstance } from 'fluture'
import { estimateTokens } from '../token-optimization'
import type { ToolHandler } from './common'
import { createError } from './common'

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'getLayoutSummary',
    description:
      'Get a token-efficient structural text summary of the page layout at a specific timestamp ' +
      '(headers, sidebars, modals, columns, primary CTAs) with stable [ref=<nodeId>] references ' +
      'for follow-up queries via getElementDetails. Use this INSTEAD OF captureScreenshot for layout ' +
      'understanding — it is meaningfully smaller than a screenshot in token cost while preserving ' +
      'structural information. Only works when the recording contains DOM snapshots. ' +
      'Check for domSnapshot events via getEvents(detail="summary") before using this tool.',
    parameters: {
      type: 'object',
      properties: {
        timestampMs: {
          type: 'number',
          description:
            'Timestamp in milliseconds from the start of the recording.',
        },
        detail: {
          type: 'string',
          enum: ['overview', 'regions', 'detailed'],
          default: 'regions',
          description:
            'Detail level: "overview" (top-level regions only, ≤500 tokens), ' +
            '"regions" (regions + CTAs/grids, default, ≤2000 tokens), ' +
            '"detailed" (full depth, ≤8000 tokens).',
        },
      },
    },
  },
}

export const handler: ToolHandler = (recording, args) => {
  const timestampMs = (args.timestampMs as number) ?? 0
  const detail = (args.detail as string) ?? 'regions'

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
      const interaction = snapshot.interaction
        ? { viewport: snapshot.interaction.viewport as [number, number] }
        : null

      // Accept both 'overview', 'regions', 'detailed' from the tool args
      // and map them to the layout summary's DetailLevel type
      const summary = buildLayoutSummary(vtree, interaction, {
        detail: detail as 'overview' | 'regions' | 'detailed',
      })

      const layout = formatLayoutSummary(summary, { showTokenEstimate: true })

      const result = {
        layout,
        timestampMs,
        detail: summary.detail,
        framing: summary.framing,
        viewport: summary.viewport,
      }
      return resolve({ ...result, _tokenEstimate: estimateTokens(result) })
    })
  )
}
