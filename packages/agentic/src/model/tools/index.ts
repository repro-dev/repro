import { RecordingDataAccessor } from "../../types";
import { createError } from "./common";
export type { ToolHandler } from "./common";
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
import type { ToolHandler } from "./common";

export const tools = [
  getRecordingDurationDef,
  getConsoleMessagesDef,
  getNetworkRequestsDef,
  getDOMStateDef,
  findErrorsDef,
  getElementDetailsDef,
  getEventsDef,
  getEventsAroundTimeDef,
  getDOMDiffDef,
];

const toolHandlers: Record<string, ToolHandler> = {
  getRecordingDuration,
  getConsoleMessages,
  getNetworkRequests,
  getDOMState,
  findErrors,
  getElementDetails,
  getEvents,
  getEventsAroundTime,
  getDOMDiff,
};

export async function executeTool(
  recording: RecordingDataAccessor,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handler = toolHandlers[name];
  if (!handler) {
    return createError(
      `Unknown tool: ${name}`,
      "The tool name does not match any registered tool",
      `Available tools are: ${Object.keys(toolHandlers).join(", ")}`,
    );
  }
  return handler(recording, args);
}
