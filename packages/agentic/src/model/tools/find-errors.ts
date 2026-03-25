import {
  ConsoleEvent,
  LogLevel,
  NetworkEvent,
  SourceEventType,
} from "@repro/domain";
import { groupNetworkEvents } from "@repro/source-utils";
import { Box } from "@repro/tdl";
import { DetailLevel, estimateTokens, truncate } from "../token-optimization";
import { serializeMessagePart } from "./common";
import type { ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "findErrors",
    description:
      "Find errors in the recording — console errors and failed network requests — sorted chronologically. Start with detail='summary' to get counts and one representative error per source. Escalate to 'normal' or 'full' only if needed.",
    parameters: {
      type: "object",
      properties: {
        timeRangeStartMs: {
          type: "number",
          description:
            "Start of time range in ms from recording start. If omitted, defaults to recording start.",
        },
        timeRangeEndMs: {
          type: "number",
          description:
            "End of time range in ms from recording start. If omitted, defaults to recording end.",
        },
        detail: {
          type: "string",
          enum: ["summary", "normal", "full"],
          description:
            "Level of detail. 'summary': counts + one representative error per source, no stack frames. 'normal' (default): all errors, truncated messages, up to 3 stack frames. 'full': all errors, longer messages, up to 10 stack frames.",
        },
      },
    },
  },
};

export const handler: ToolHandler = async (recording, args) => {
  const timeStart = args.timeRangeStartMs as number | undefined;
  const timeEnd = args.timeRangeEndMs as number | undefined;
  const detail = (args.detail as DetailLevel) ?? "normal";

  const errors: Array<{
    time: number;
    source: "console" | "network";
    summary: string;
    stack?: string[];
  }> = [];

  // Console errors
  const consoleEvents = recording.getEventsByType([SourceEventType.Console], {
    startMs: timeStart,
    endMs: timeEnd,
  });

  for (const event of consoleEvents) {
    const consoleEvent = event as Box<ConsoleEvent>;
    const time = consoleEvent.get("time").orElse(0);
    const level = consoleEvent.get("data").get("level").orElse(LogLevel.Info);
    if (level !== LogLevel.Error) continue;

    const parts = consoleEvent.get("data").get("parts").orElse([]);
    const text = parts.map(serializeMessagePart).join(" ");

    const maxLen = detail === "full" ? 500 : detail === "summary" ? 100 : 200;
    const summary = truncate(text, maxLen);

    const stackEntries = consoleEvent.get("data").get("stack").orElse([]);

    let stack: string[] | undefined;
    if (detail !== "summary") {
      const maxFrames = detail === "full" ? 10 : 3;
      const frames = stackEntries.slice(0, maxFrames).map((entry) => {
        const fileName = entry.fileName;
        const basename = fileName.split("/").pop() ?? fileName;
        return `${basename}:${entry.lineNumber}:${entry.columnNumber}`;
      });
      if (frames.length > 0) stack = frames;
    }

    errors.push({
      time,
      source: "console",
      summary,
      ...(stack ? { stack } : {}),
    });
  }

  // Network errors — pass time range to avoid iterating all events
  const networkEvents = recording.getEventsByType([SourceEventType.Network], {
    startMs: timeStart,
    endMs: timeEnd,
  });
  const indexed: Array<[NetworkEvent, number]> = [];
  for (const e of networkEvents) {
    (e as Box<NetworkEvent>).apply((n) => indexed.push([n, 0]));
  }
  const groups = groupNetworkEvents(indexed);

  for (const group of groups) {
    if (group.type !== "fetch") continue;
    if (!group.response || group.response.status < 400) continue;

    const time = group.requestTime;

    let pathname: string;
    try {
      pathname = new URL(group.request.url).pathname;
    } catch {
      pathname = group.request.url;
    }

    errors.push({
      time,
      source: "network",
      summary: `${group.request.method} ${pathname} → ${group.response.status}`,
    });
  }

  errors.sort((a, b) => a.time - b.time);

  const consoleCount = errors.filter((e) => e.source === "console").length;
  const networkCount = errors.filter((e) => e.source === "network").length;
  const summaryStats = {
    console: consoleCount,
    network: networkCount,
    total: consoleCount + networkCount,
  };

  if (detail === "summary") {
    const representativeErrors = (["console", "network"] as const)
      .map((src) => errors.find((e) => e.source === src))
      .filter((e): e is NonNullable<typeof e> => e !== undefined)
      .map(({ time, source, summary }) => ({ time, source, summary }));
    const result = { errors: representativeErrors, summary: summaryStats };
    return { ...result, _tokenEstimate: estimateTokens(result) };
  }

  const result = { errors, summary: summaryStats };
  return { ...result, _tokenEstimate: estimateTokens(result) };
};
