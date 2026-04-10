import { ConsoleEvent, LogLevel, SourceEventType } from "@repro/domain";
import { Box } from "@repro/tdl";
import { resolve } from "fluture";
import { estimateTokens, truncate } from "../token-optimization";
import { LOG_LEVEL_NAMES, serializeMessagePart } from "./common";
import type { ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getConsoleContext",
    description:
      "Get console messages surrounding a specific timestamp. Returns N messages before and M messages after the nearest console message to the given time.",
    parameters: {
      type: "object",
      properties: {
        timestampMs: {
          type: "number",
          description:
            "The timestamp (in milliseconds) to center the context window on.",
        },
        linesBefore: {
          type: "number",
          default: 10,
          description:
            "Number of console messages to include before the pivot. Defaults to 10.",
        },
        linesAfter: {
          type: "number",
          default: 5,
          description:
            "Number of console messages to include after the pivot. Defaults to 5.",
        },
      },
      required: ["timestampMs"],
    },
  },
};

export const handler: ToolHandler = (recording, args) => {
  const timestampMs = args.timestampMs as number;
  const linesBefore = (args.linesBefore as number) ?? 10;
  const linesAfter = (args.linesAfter as number) ?? 5;

  const events = recording.getEventsByType([SourceEventType.Console]);

  if (events.length === 0) {
    const empty = { messages: [] };
    return resolve({ ...empty, _tokenEstimate: estimateTokens(empty) });
  }

  // Serialize all console events to message objects
  type StackFrame = {
    functionName?: string;
    fileName: string;
    line: number;
    column: number;
  };

  type ConsoleMessage = {
    timeMs: number;
    level: string;
    text: string;
    stack?: StackFrame[];
  };

  const allMessages: ConsoleMessage[] = events.map((event) => {
    const consoleEvent: Box<ConsoleEvent> = event as Box<ConsoleEvent>;
    const time = consoleEvent.get("time").orElse(0);
    const level = consoleEvent.get("data").get("level").orElse(LogLevel.Info);
    const levelName = LOG_LEVEL_NAMES[level] ?? "info";

    const parts = consoleEvent.get("data").get("parts").orElse([]);
    const rawText = parts.map(serializeMessagePart).join(" ");
    const text = truncate(rawText, 500);

    const stackEntries = consoleEvent.get("data").get("stack").orElse([]);
    const stack: StackFrame[] = stackEntries.map((entry) => {
      const frame: StackFrame = {
        fileName: entry.fileName,
        line: entry.lineNumber,
        column: entry.columnNumber,
      };
      // Only include functionName if it is a non-null, non-undefined string
      if (entry.functionName != null) {
        frame.functionName = entry.functionName;
      }
      return frame;
    });

    const msg: ConsoleMessage = { timeMs: time, level: levelName, text };
    if (stack.length > 0) msg.stack = stack;
    return msg;
  });

  // Find the pivot: index of the message nearest to timestampMs
  let pivotIndex = 0;
  let minDiff = Math.abs(allMessages[0]!.timeMs - timestampMs);
  for (let i = 1; i < allMessages.length; i++) {
    const diff = Math.abs(allMessages[i]!.timeMs - timestampMs);
    if (diff < minDiff) {
      minDiff = diff;
      pivotIndex = i;
    }
  }

  // Slice the window around the pivot
  const startIndex = Math.max(0, pivotIndex - linesBefore);
  const endIndex = Math.min(allMessages.length - 1, pivotIndex + linesAfter);
  const messages = allMessages.slice(startIndex, endIndex + 1);

  return resolve({ messages, _tokenEstimate: estimateTokens({ messages }) });
};
