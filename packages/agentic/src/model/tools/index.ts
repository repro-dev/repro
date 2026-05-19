import { FutureInstance, resolve } from "fluture";
import { RecordingDataAccessor, ToolExecutionContext } from "../../types";
import { createError } from "./common";
export type { ToolHandler } from "./common";
import { TOOL_DEFINITION as askUserDef, handler as askUser } from "./ask-user";
import {
  TOOL_DEFINITION as advanceStageDef,
  handler as advanceStage,
} from "./advance-stage";
import {
  TOOL_DEFINITION as captureScreenshotDef,
  handler as captureScreenshot,
} from "./capture-screenshot";
import {
  TOOL_DEFINITION as findErrorsDef,
  handler as findErrors,
} from "./find-errors";
import {
  TOOL_DEFINITION as getConsoleMessagesDef,
  handler as getConsoleMessages,
} from "./get-console-messages";
import {
  TOOL_DEFINITION as getDOMStateDef,
  handler as getDOMState,
} from "./get-dom-state";
import {
  TOOL_DEFINITION as getElementDetailsDef,
  handler as getElementDetails,
} from "./get-element-details";
import {
  TOOL_DEFINITION as getDOMDiffDef,
  handler as getDOMDiff,
} from "./get-dom-diff";
import {
  TOOL_DEFINITION as getEventsAroundTimeDef,
  handler as getEventsAroundTime,
} from "./get-events-around-time";
import {
  TOOL_DEFINITION as getEventsDef,
  handler as getEvents,
} from "./get-events";
import {
  TOOL_DEFINITION as getNetworkRequestsDef,
  handler as getNetworkRequests,
} from "./get-network-requests";
import {
  TOOL_DEFINITION as getRecordingDurationDef,
  handler as getRecordingDuration,
} from "./get-recording-duration";
import {
  TOOL_DEFINITION as getUserActionsDef,
  handler as getUserActions,
} from "./get-user-actions";
import {
  TOOL_DEFINITION as getStateChangesDef,
  handler as getStateChanges,
} from "./get-state-changes";
import {
  TOOL_DEFINITION as findUserFrustrationDef,
  handler as findUserFrustration,
} from "./find-user-frustration";
import {
  TOOL_DEFINITION as getConsoleContextDef,
  handler as getConsoleContext,
} from "./get-console-context";
import {
  TOOL_DEFINITION as searchEventsDef,
  handler as searchEvents,
} from "./search-events";
import {
  TOOL_DEFINITION as compareDOMAtTimesDef,
  handler as compareDOMAtTimes,
} from "./compare-dom-at-times";
import type { ToolHandler } from "./common";

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
  advanceStageDef,
  captureScreenshotDef,
  askUserDef,
  getStateChangesDef,
  findUserFrustrationDef,
  searchEventsDef,
  compareDOMAtTimesDef,
];

// Subset of tools for the browser extension agent. captureScreenshot is
// excluded until it has been tested and refined in the extension context.
export const extensionTools = tools.filter(
  (t) =>
    (t as { function: { name: string } }).function.name !==
      "captureScreenshot" &&
    (t as { function: { name: string } }).function.name !== "askUser",
);

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
  advanceStage,
  captureScreenshot,
  askUser,
  getStateChanges,
  findUserFrustration,
  searchEvents,
  compareDOMAtTimes,
};

export function executeTool(
  recording: RecordingDataAccessor,
  name: string,
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
): FutureInstance<unknown, unknown> {
  const handler = toolHandlers[name];
  if (!handler) {
    return resolve(
      createError(
        `Unknown tool: ${name}`,
        "The tool name does not match any registered tool",
        `Available tools are: ${Object.keys(toolHandlers).join(", ")}`,
      ),
    );
  }
  return handler(recording, args, context);
}
