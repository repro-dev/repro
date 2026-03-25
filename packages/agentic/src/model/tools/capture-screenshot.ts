import { attemptP } from 'fluture'
import { estimateTokens } from '../token-optimization'
import { createError } from './common'
import type { ToolHandler } from './common'

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'captureScreenshot',
    description:
      'Capture a screenshot of the recording at a specific timestamp. Returns a base64 PNG data URL that can be embedded in a Linear issue description or comment.',
    parameters: {
      type: 'object',
      properties: {
        timestampMs: {
          type: 'number',
          description: 'Timestamp in milliseconds from the start of the recording.',
        },
      },
      required: ['timestampMs'],
    },
  },
}

export const handler: ToolHandler = (recording, args) => {
  const timestampMs = (args.timestampMs as number) ?? 0

  return attemptP(async () => {
    let dataUrl: string
    try {
      dataUrl = await recording.captureScreenshot(timestampMs)
    } catch (err) {
      return {
        ...createError(
          'Screenshot capture failed',
          err instanceof Error ? err.message : 'Unknown error during capture',
          'Ensure the timestamp is within the recording range by calling getRecordingDuration() first',
        ),
        _tokenEstimate: estimateTokens({ error: true }),
      }
    }

    const result = { timestampMs, dataUrl }
    return { ...result, _tokenEstimate: estimateTokens(result) }
  })
}
