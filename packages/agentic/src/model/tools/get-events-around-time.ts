import {
  Click,
  ConsoleEvent,
  DoubleClick,
  InteractionEvent,
  InteractionType,
  KeyDown,
  LogLevel,
  PageTransition,
  Scroll,
  SourceEventType,
  ViewportResize,
} from "@repro/domain";
import { Box } from "@repro/tdl";
import { resolve } from "fluture";
import {
  createError,
  isConsoleEvent,
  isDOMPatchEvent,
  isInteractionEvent,
  isNetworkEvent,
  LOG_LEVEL_NAMES,
  serializeMessagePart,
} from "./common";
import type { ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getEventsAroundTime",
    description:
      "Get detailed events in a small window around a specific timestamp. Use this as a targeted follow-up after identifying a moment of interest (e.g. an error or failed request) — not for broad exploration. Includes full console message text. For a complete stack trace, use findErrors with detail='full' on the error's timestamp. Do not call if getEvents or findErrors already returned sufficient data for the same time range. After locating an error with findErrors(detail='summary'), your next step to get more detail is findErrors(detail='full'). You MUST NOT call getEventsAroundTime to re-fetch the same error's message text, as this provides no new information and is inefficient.",
    parameters: {
      type: "object",
      properties: {
        timestampMs: {
          type: "number",
          description:
            "The timestamp in ms from recording start to center the window on.",
        },
        windowMs: {
          type: "number",
          description:
            "Total window size in ms (default 5000). Events from [timestampMs - windowMs/2, timestampMs + windowMs/2] are returned.",
        },
      },
      required: ["timestampMs"],
    },
  },
};

function summarizeInteraction(
  event: Box<InteractionEvent>,
): { type: string; [key: string]: unknown } | null {
  const interaction = event.get("data").flat() as Box<
    ViewportResize | Scroll | KeyDown | Click | DoubleClick | PageTransition
  >;
  const interactionType = interaction.get("type").orElse(-1 as InteractionType);

  switch (interactionType) {
    case InteractionType.PointerMove:
    case InteractionType.PointerDown:
    case InteractionType.PointerUp:
      return null;

    case InteractionType.Click:
    case InteractionType.DoubleClick: {
      const clickEvent = interaction as Box<Click | DoubleClick>;
      const label = clickEvent
        .get("meta")
        .get("humanReadableLabel")
        .orElse(null);
      const nodeId = clickEvent.get("meta").get("node").get("id").orElse(null);
      const tagName = clickEvent
        .get("meta")
        .get("node")
        .get("tagName")
        .orElse("");
      const rawAttributes = clickEvent
        .get("meta")
        .get("node")
        .get("attributes")
        .orElse({}) as Record<string, string | null>;
      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawAttributes)) {
        if (v != null) attributes[k] = v;
      }
      const element = nodeId ? { nodeId, tagName, attributes } : null;
      const targets = clickEvent.get("targets").orElse([]) as string[];
      return {
        type:
          interactionType === InteractionType.Click ? "click" : "doubleClick",
        ...(label ? { label } : {}),
        ...(element ? { element } : {}),
        ...(targets.length > 0 ? { targets } : {}),
      };
    }

    case InteractionType.KeyDown: {
      const keyEvent = interaction as Box<KeyDown>;
      return { type: "keyDown", key: keyEvent.get("key").orElse("") };
    }

    case InteractionType.KeyUp:
      return null;

    case InteractionType.Scroll: {
      const scrollEvent = interaction as Box<Scroll>;
      const target = scrollEvent.get("target").orElse("" as unknown as number);
      return { type: "scroll", target: String(target) };
    }

    case InteractionType.PageTransition: {
      const pageEvent = interaction as Box<PageTransition>;
      const from = pageEvent.get("from").orElse(null);
      const to = pageEvent.get("to").orElse("");
      return {
        type: "pageTransition",
        ...(from ? { from } : {}),
        to,
      };
    }

    case InteractionType.ViewportResize: {
      const resizeEvent = interaction as Box<ViewportResize>;
      const to = resizeEvent.get("to").orElse([0, 0] as [number, number]);
      return {
        type: "viewportResize",
        to: { width: to[0], height: to[1] },
      };
    }

    default:
      return null;
  }
}

export const handler: ToolHandler = (recording, args) => {
  const timestampMs = args.timestampMs as number;
  const windowMs = (args.windowMs as number) ?? 5000;

  const duration = recording.getDuration();

  if (timestampMs < 0 || timestampMs > duration) {
    return resolve(
      createError(
        `Timestamp ${timestampMs}ms is outside the recording range (0–${duration}ms)`,
        "The provided timestamp falls outside the bounds of the recording",
        "Call getRecordingDuration() to get the valid time range, then retry with a timestamp between 0 and the recording duration",
      ),
    );
  }

  const halfWindow = windowMs / 2;
  const startTime = Math.max(0, timestampMs - halfWindow);
  const endTime = Math.min(recording.getDuration(), timestampMs + halfWindow);

  const events = recording.getEventsInRange(startTime, endTime);
  const result: Array<{
    timeMs: number;
    type: string;
    [key: string]: unknown;
  }> = [];

  for (const event of events) {
    const time = event.get("time").orElse(0);

    if (isInteractionEvent(event)) {
      const summary = summarizeInteraction(event);
      if (!summary) continue;
      result.push({ timeMs: time, ...summary });
      continue;
    }

    if (isDOMPatchEvent(event)) {
      continue;
    }

    if (event.match((e) => e.type === SourceEventType.Snapshot)) {
      continue;
    }

    if (isNetworkEvent(event)) {
      result.push({ timeMs: time, type: "network" });
      continue;
    }

    if (isConsoleEvent(event)) {
      const consoleEvent: Box<ConsoleEvent> = event;
      const level = consoleEvent.get("data").get("level").orElse(LogLevel.Info);
      const parts = consoleEvent.get("data").get("parts").orElse([]);
      const text = parts.map(serializeMessagePart).join(" ");
      result.push({
        timeMs: time,
        type: "console",
        level: LOG_LEVEL_NAMES[level] ?? "info",
        text,
      });
      continue;
    }

    if (event.match((e) => e.type === SourceEventType.Performance)) {
      result.push({ timeMs: time, type: "performance" });
      continue;
    }
  }

  return resolve({
    centerMs: timestampMs,
    windowMs,
    rangeStartMs: startTime,
    rangeEndMs: endTime,
    events: result,
    _tokenEstimate: Math.ceil(JSON.stringify(result).length / 4) + 20,
  });
};
