import { estimateTokens } from "../token-optimization";
import type { ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getRecordingDuration",
    description: "Get the duration of the recording.",
    parameters: {
      type: "object",
      properties: {
        detail: {
          type: "string",
          enum: ["summary", "normal", "full"],
          default: "normal",
          description:
            "Level of detail in the response. Use 'summary' for initial triage, 'normal' for standard debugging, 'full' for deep investigation.",
        },
      },
    },
  },
};

export const handler: ToolHandler = async (recording) => {
  const result = { durationMs: recording.getDuration() };
  return { ...result, _tokenEstimate: estimateTokens(result) };
};
