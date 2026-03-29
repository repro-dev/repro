import { ConsoleEvent, LogLevel, SourceEventType } from "@repro/domain";
import { Box } from "@repro/tdl";
import { resolve } from "fluture";
import {
  DetailLevel,
  estimateTokens,
  shortenStackFrame,
  truncate,
} from "../token-optimization";
import { LOG_LEVEL_MAP, LOG_LEVEL_NAMES, serializeMessagePart } from "./common";
import type { ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getConsoleMessages",
    description:
      "Get recorded console messages, with an optional minimum log level and time range. Use this for reviewing console output broadly across a time window. For the full text of a single known error, prefer getEventsAroundTime; for the full stack trace of a known error, use findErrors with detail='full'.",
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
        logLevel: {
          type: "string",
          enum: ["verbose", "info", "warning", "error"],
          default: "info",
          description: "The minimum level of logs to include.",
        },
        timeRangeStartMs: {
          type: "number",
          description:
            "The start of the time range for returned log messages. If omitted, this will default to the start of the recording.",
        },
        timeRangeEndMs: {
          type: "number",
          description:
            "The end of the time range for returned log messages. If omitted, this will default to the end of the recording.",
        },
      },
    },
  },
};

export const handler: ToolHandler = (recording, args) => {
  const detail = (args.detail as DetailLevel) ?? "normal";
  const logLevelStr = (args.logLevel as string) ?? "info";
  const timeStart = args.timeRangeStartMs as number | undefined;
  const timeEnd = args.timeRangeEndMs as number | undefined;

  const userMinLevel = LOG_LEVEL_MAP[logLevelStr] ?? LogLevel.Info;

  let tierMinLevel = userMinLevel;
  if (detail === "summary") {
    tierMinLevel = Math.max(userMinLevel, LogLevel.Error);
  } else if (detail === "normal") {
    tierMinLevel = Math.max(userMinLevel, LogLevel.Warning);
  }

  const TEXT_MAX: Record<DetailLevel, number> = {
    summary: 100,
    normal: 200,
    full: 500,
  };
  const STACK_MAX: Record<DetailLevel, number> = {
    summary: 0,
    normal: 3,
    full: 10,
  };

  const levelSummary = { verbose: 0, info: 0, warning: 0, error: 0 };

  type CollectedMessage = {
    timeMs: number;
    levelName: string;
    text: string;
    stack: string[];
  };

  const collected: CollectedMessage[] = [];

  const events = recording.getEventsByType([SourceEventType.Console], {
    startMs: timeStart,
    endMs: timeEnd,
  });

  for (const event of events) {
    const consoleEvent: Box<ConsoleEvent> = event as Box<ConsoleEvent>;

    const time = consoleEvent.get("time").orElse(0);

    const level = consoleEvent.get("data").get("level").orElse(LogLevel.Info);
    if (level < userMinLevel) continue;

    const levelName = LOG_LEVEL_NAMES[level] ?? "info";
    if (levelName === "verbose") levelSummary.verbose++;
    else if (levelName === "info") levelSummary.info++;
    else if (levelName === "warning") levelSummary.warning++;
    else if (levelName === "error") levelSummary.error++;

    if (level < tierMinLevel) continue;

    const parts = consoleEvent.get("data").get("parts").orElse([]);
    const rawText = parts.map(serializeMessagePart).join(" ");
    const text = truncate(rawText, TEXT_MAX[detail]);

    const stackEntries = consoleEvent.get("data").get("stack").orElse([]);
    const maxFrames = STACK_MAX[detail];
    const stack =
      maxFrames === 0
        ? []
        : stackEntries
            .slice(0, maxFrames)
            .map((entry) =>
              shortenStackFrame(
                `${entry.fileName}:${entry.lineNumber}:${entry.columnNumber}`,
              ),
            );

    collected.push({ timeMs: time, levelName, text, stack });
  }

  type OutputMessage = {
    timeMs: number;
    level: string;
    text: string;
    stack?: string[];
    count?: number;
  };

  let messages: OutputMessage[];

  if (detail === "full") {
    messages = collected.map((m) => {
      const msg: OutputMessage = {
        timeMs: m.timeMs,
        level: m.levelName,
        text: m.text,
      };
      if (m.stack.length > 0) msg.stack = m.stack;
      return msg;
    });
  } else {
    const dedupMap = new Map<string, OutputMessage>();
    for (const m of collected) {
      const existing = dedupMap.get(m.text);
      if (existing) {
        existing.count = (existing.count ?? 1) + 1;
      } else {
        const msg: OutputMessage = {
          timeMs: m.timeMs,
          level: m.levelName,
          text: m.text,
          count: 1,
        };
        if (m.stack.length > 0) msg.stack = m.stack;
        dedupMap.set(m.text, msg);
      }
    }
    messages = Array.from(dedupMap.values());
    if (detail === "summary") {
      messages = messages.slice(0, 3);
    }
  }

  const response = {
    messages,
    summary: levelSummary,
  };

  const logLevelFilterProvided = args.logLevel !== undefined;

  if (messages.length === 0 && logLevelFilterProvided) {
    return resolve({
      ...response,
      _hint:
        "No console messages matched the provided filter. Call getConsoleMessages() without filters to see all available messages.",
      _tokenEstimate: estimateTokens(response),
    });
  }

  return resolve({ ...response, _tokenEstimate: estimateTokens(response) });
};
