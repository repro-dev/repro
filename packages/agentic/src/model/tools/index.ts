import { FutureInstance, resolve } from 'fluture'
import { RecordingDataAccessor } from '../../types'
import {
  handler as captureScreenshot,
  TOOL_DEFINITION as captureScreenshotDef,
} from './capture-screenshot'
import type { ToolHandler } from './common'
import { createError } from './common'
import {
  handler as findErrors,
  TOOL_DEFINITION as findErrorsDef,
} from './find-errors'
import {
  handler as findUserFrustration,
  TOOL_DEFINITION as findUserFrustrationDef,
} from './find-user-frustration'
import {
  handler as getConsoleContext,
  TOOL_DEFINITION as getConsoleContextDef,
} from './get-console-context'
import {
  handler as getConsoleMessages,
  TOOL_DEFINITION as getConsoleMessagesDef,
} from './get-console-messages'
import {
  handler as getDOMDiff,
  TOOL_DEFINITION as getDOMDiffDef,
} from './get-dom-diff'
import {
  handler as getDOMState,
  TOOL_DEFINITION as getDOMStateDef,
} from './get-dom-state'
import {
  handler as getElementDetails,
  TOOL_DEFINITION as getElementDetailsDef,
} from './get-element-details'
import {
  handler as getEvents,
  TOOL_DEFINITION as getEventsDef,
} from './get-events'
import {
  handler as getEventsAroundTime,
  TOOL_DEFINITION as getEventsAroundTimeDef,
} from './get-events-around-time'
import {
  handler as getNetworkRequests,
  TOOL_DEFINITION as getNetworkRequestsDef,
} from './get-network-requests'
import {
  handler as getRecordingDuration,
  TOOL_DEFINITION as getRecordingDurationDef,
} from './get-recording-duration'
import {
  handler as getStateChanges,
  TOOL_DEFINITION as getStateChangesDef,
} from './get-state-changes'
import {
  handler as getUserActions,
  TOOL_DEFINITION as getUserActionsDef,
} from './get-user-actions'
import {
  handler as searchEvents,
  TOOL_DEFINITION as searchEventsDef,
} from './search-events'
export type { ToolHandler } from './common'

export const tools = [
  getRecordingDurationDef,
  getConsoleMessagesDef,
  getConsoleContextDef,
  getNetworkRequestsDef,
  getDOMStateDef,
  findErrorsDef,
  getElementDetailsDef,
  getEventsDef,
  getEventsAroundTimeDef,
  getDOMDiffDef,
  getUserActionsDef,
  captureScreenshotDef,
  getStateChangesDef,
  findUserFrustrationDef,
  searchEventsDef,
]

// Subset of tools for the browser extension agent. captureScreenshot is
// excluded until it has been tested and refined in the extension context.
export const extensionTools = tools.filter(
  t =>
    (t as { function: { name: string } }).function.name !== 'captureScreenshot'
)

const toolHandlers: Record<string, ToolHandler> = {
  getRecordingDuration,
  getConsoleMessages,
  getConsoleContext,
  getNetworkRequests,
  getDOMState,
  findErrors,
  getElementDetails,
  getEvents,
  getEventsAroundTime,
  getDOMDiff,
  getUserActions,
  captureScreenshot,
  getStateChanges,
  findUserFrustration,
  searchEvents,
}

export function executeTool(
  recording: RecordingDataAccessor,
  name: string,
  args: Record<string, unknown>
): FutureInstance<unknown, unknown> {
  const handler = toolHandlers[name]
  if (!handler) {
    return resolve(
      createError(
        `Unknown tool: ${name}`,
        'The tool name does not match any registered tool',
        `Available tools are: ${Object.keys(toolHandlers).join(', ')}`
      )
    )
  }
  return handler(recording, args)
}
