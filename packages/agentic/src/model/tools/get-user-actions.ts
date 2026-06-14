import {
  InteractionEvent,
  InteractionType,
  SourceEventType,
} from '@repro/domain'
import { filterNullAttributes } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { resolve } from 'fluture'
import type { ToolHandler } from './common'
import { isDOMPatchEvent, isInteractionEvent, isNetworkEvent } from './common'

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'getUserActions',
    description:
      "Get a narrated summary of all user actions in the recording. For each click and double-click, includes the target element's nodeId, tag, and key attributes so you can call getElementDetails for deeper inspection. For typed sequences, groups consecutive keystrokes into text. Use this as your PRIMARY tool when asked what the user did, what they interacted with, or to walk through user behaviour. Prefer this over manually calling getEvents + getElementDetails in a loop.",
    parameters: {
      type: 'object',
      properties: {
        startTimeMs: {
          type: 'number',
          description: 'Start of time range in ms from recording start.',
        },
        endTimeMs: {
          type: 'number',
          description: 'End of time range in ms from recording start.',
        },
      },
    },
  },
}

export const handler: ToolHandler = (recording, args) => {
  const startTime = (args.startTimeMs as number | undefined) ?? 0
  const duration = recording.getDuration()
  const endTime =
    args.endTimeMs !== undefined
      ? (args.endTimeMs as number)
      : duration > 0
      ? duration
      : Number.MAX_SAFE_INTEGER

  const events = recording.getEventsInRange(startTime, endTime)

  const actions: Array<Record<string, unknown>> = []
  let pendingKeys: Array<{ time: number; key: string }> = []

  function flushKeystrokes() {
    if (pendingKeys.length === 0) return
    const text = pendingKeys
      .map(k => (k.key.length === 1 ? k.key : `[${k.key}]`))
      .join('')
    actions.push({ timeMs: pendingKeys[0]!.time, action: 'typed', text })
    pendingKeys = []
  }

  for (const event of events) {
    const time = event.get('time').orElse(0)

    if (isInteractionEvent(event)) {
      const interactionData = (event as Box<InteractionEvent>)
        .get('data')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .orElse(null) as Box<any> | null
      if (!interactionData) continue
      const interactionType = interactionData
        .get('type')
        .orElse(-1 as InteractionType)

      // Skip pointer events — not meaningful user actions in narrative sense
      if (
        interactionType === InteractionType.PointerMove ||
        interactionType === InteractionType.PointerDown ||
        interactionType === InteractionType.PointerUp
      ) {
        continue
      }

      // Skip keyUp events
      if (interactionType === InteractionType.KeyUp) {
        continue
      }

      // Skip viewport resize — not a user action in the narrative sense
      if (interactionType === InteractionType.ViewportResize) {
        flushKeystrokes()
        continue
      }

      if (
        interactionType === InteractionType.Click ||
        interactionType === InteractionType.DoubleClick
      ) {
        flushKeystrokes()
        const meta = interactionData.get('meta')
        const label = meta.get('humanReadableLabel').orElse(null)
        const nodeId = meta.get('node').get('id').orElse(null)
        const tagName = meta.get('node').get('tagName').orElse('')
        const rawAttributes = meta
          .get('node')
          .get('attributes')
          .orElse({}) as Record<string, string | null>
        const attributes = filterNullAttributes(rawAttributes)
        const element = nodeId ? { nodeId, tagName, attributes } : null
        const targets = interactionData.get('targets').orElse([]) as string[]
        const actionType =
          interactionType === InteractionType.Click ? 'click' : 'doubleClick'
        actions.push({
          timeMs: time,
          action: actionType,
          ...(label ? { label } : {}),
          element,
          targets,
        })
        continue
      }

      if (interactionType === InteractionType.KeyDown) {
        const key = interactionData.get('key').orElse('')
        pendingKeys.push({ time, key })
        continue
      }

      if (interactionType === InteractionType.Scroll) {
        flushKeystrokes()
        const to = interactionData.get('to').orElse([0, 0])
        actions.push({
          timeMs: time,
          action: 'scroll',
          to: { x: to[0], y: to[1] },
        })
        continue
      }

      if (interactionType === InteractionType.PageTransition) {
        flushKeystrokes()
        const from = interactionData.get('from').orElse(null)
        const to = interactionData.get('to').orElse('')
        actions.push({
          timeMs: time,
          action: 'pageTransition',
          ...(from ? { from } : {}),
          to,
        })
        continue
      }

      continue
    }

    // Skip DOM patches, snapshots, network, console, performance
    if (isDOMPatchEvent(event)) continue
    if (event.match(e => e.type === SourceEventType.Snapshot)) continue
    if (isNetworkEvent(event)) continue
    if (event.match(e => e.type === SourceEventType.Console)) continue
    if (event.match(e => e.type === SourceEventType.Performance)) continue
  }

  flushKeystrokes()

  return resolve({
    actions,
    totalActions: actions.length,
    _tokenEstimate: Math.ceil(JSON.stringify(actions).length / 4) + 10,
  })
}
