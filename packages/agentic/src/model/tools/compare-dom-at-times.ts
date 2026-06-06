import { diffVTrees } from '@repro/vdom-utils'
import { resolve } from 'fluture'
import { estimateTokens } from '../token-optimization'
import type { ToolHandler } from './common'
import { createError } from './common'

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'compareDOMAtTimes',
    description:
      'Compare the DOM state at two timestamps to identify what changed between them. Returns page URL, viewport size, and a structured list of DOM changes (added/removed nodes, attribute changes, text changes, property changes). Use this when the user describes "it worked before" scenarios or wants to understand what changed between two moments. Requires DOM snapshots — check for the presence of domSnapshot events via getEvents(detail=\'summary\') before using this tool.',
    parameters: {
      type: 'object',
      properties: {
        t1Ms: {
          type: 'number',
          description:
            'First timestamp in milliseconds from the start of the recording (the "before" snapshot).',
        },
        t2Ms: {
          type: 'number',
          description:
            'Second timestamp in milliseconds from the start of the recording (the "after" snapshot).',
        },
      },
      required: ['t1Ms', 't2Ms'],
    },
  },
}

export const handler: ToolHandler = (recording, args) => {
  const t1Ms = args.t1Ms as number | undefined
  const t2Ms = args.t2Ms as number | undefined

  if (t1Ms === undefined) {
    return resolve(
      createError(
        't1Ms parameter is required',
        'The t1Ms parameter was not provided',
        'Call getRecordingDuration() to get the valid recording time range, then provide two timestamps within that range'
      )
    )
  }

  if (t2Ms === undefined) {
    return resolve(
      createError(
        't2Ms parameter is required',
        'The t2Ms parameter was not provided',
        'Call getRecordingDuration() to get the valid recording time range, then provide two timestamps within that range'
      )
    )
  }

  const snapshot1 = recording.getSnapshotAtTime(t1Ms)
  if (!snapshot1 || !snapshot1.dom) {
    return resolve(
      createError(
        `No DOM snapshot available at t1Ms=${t1Ms}`,
        'The timestamp may be outside the recording range or no DOM snapshot was captured at this point',
        'Call getRecordingDuration() to get the valid recording time range, then retry with timestamps within that range'
      )
    )
  }

  const snapshot2 = recording.getSnapshotAtTime(t2Ms)
  if (!snapshot2 || !snapshot2.dom) {
    return resolve(
      createError(
        `No DOM snapshot available at t2Ms=${t2Ms}`,
        'The timestamp may be outside the recording range or no DOM snapshot was captured at this point',
        'Call getRecordingDuration() to get the valid recording time range, then retry with timestamps within that range'
      )
    )
  }

  if (!snapshot1.interaction || !snapshot2.interaction) {
    const missingTimestamp = !snapshot1.interaction
      ? `t1Ms=${t1Ms}`
      : `t2Ms=${t2Ms}`
    return resolve(
      createError(
        `No interaction metadata available at ${missingTimestamp}`,
        'The DOM snapshot was captured without page URL or viewport metadata',
        "Retry with timestamps that have interaction events, or use getEvents(detail='summary') to confirm the recording includes interaction metadata"
      )
    )
  }

  const { changes, omittedCount } = diffVTrees(snapshot1.dom, snapshot2.dom)

  const beforeViewport = snapshot1.interaction.viewport
  const afterViewport = snapshot2.interaction.viewport

  const result = {
    pageURL: {
      before: snapshot1.interaction.pageURL,
      after: snapshot2.interaction.pageURL,
    },
    viewport: {
      before: {
        width: beforeViewport[0],
        height: beforeViewport[1],
      },
      after: {
        width: afterViewport[0],
        height: afterViewport[1],
      },
    },
    changes,
    omittedCount,
  }

  return resolve({ ...result, _tokenEstimate: estimateTokens(result) })
}
