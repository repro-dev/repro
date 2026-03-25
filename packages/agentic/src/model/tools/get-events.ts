import {
  ConsoleEvent,
  InteractionEvent,
  InteractionType,
  LogLevel,
  SourceEventType,
} from "@repro/domain";
import { Box } from "@repro/tdl";
import {
  isConsoleEvent,
  isDOMPatchEvent,
  isInteractionEvent,
  isNetworkEvent,
  LOG_LEVEL_NAMES,
} from "./common";
import type { ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getEvents",
    description:
      "Get a timeline of events from the recording, filtered by type and time range. Returns user interactions, page transitions, and DOM activity.",
    parameters: {
      type: "object",
      properties: {
        detail: {
          type: "string",
          enum: ["summary", "normal", "full"],
          default: "normal",
          description:
            "Level of detail: summary (counts only), normal (key events), full (all events).",
        },
        startTimeMs: {
          type: "number",
          description: "Start of time range in ms from recording start.",
        },
        endTimeMs: {
          type: "number",
          description: "End of time range in ms from recording start.",
        },
        eventTypes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "click",
              "doubleClick",
              "keyDown",
              "keyUp",
              "scroll",
              "pageTransition",
              "viewportResize",
              "domPatch",
              "network",
              "console",
              "performance",
            ],
          },
          description:
            "Filter to specific event types. If omitted, returns all types.",
        },
        limit: {
          type: "number",
          description: "Maximum number of events to return (default 100).",
        },
      },
    },
  },
};

export const handler: ToolHandler = async (recording, args) => {
  const detail = (args.detail as string) ?? "normal";
  const startTime = args.startTimeMs as number | undefined;
  const endTime = args.endTimeMs as number | undefined;
  const eventTypeFilter = args.eventTypes as string[] | undefined;
  const limit = (args.limit as number) ?? 100;

  const resultEvents: Array<Record<string, unknown>> = [];
  const domPatchBuckets: Record<number, number> = {};
  let hasMore = false;

  let pendingKeys: Array<{ time: number; key: string }> = [];

  function flushKeystrokes() {
    if (pendingKeys.length === 0) return;
    if (detail === "normal") {
      const text = pendingKeys
        .map((k) => (k.key.length === 1 ? k.key : `[${k.key}]`))
        .join("");
      resultEvents.push({
        time: pendingKeys[0]!.time,
        type: "typed",
        text,
      });
    } else if (detail === "full") {
      for (const k of pendingKeys) {
        resultEvents.push({
          time: k.time,
          type: "keyDown",
          key: k.key,
        });
      }
    }
    pendingKeys = [];
  }

  const duration = recording.getDuration();
  const effectiveEnd =
    endTime !== undefined
      ? endTime
      : duration > 0
      ? duration
      : Number.MAX_SAFE_INTEGER;
  const events = recording.getEventsInRange(startTime ?? 0, effectiveEnd);

  for (const event of events) {
    const time = event.get("time").orElse(0);

    if (isInteractionEvent(event)) {
      const interactionData = (event as Box<InteractionEvent>)
        .get("data")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .orElse(null) as Box<any> | null;
      if (!interactionData) continue;
      const interactionType = interactionData
        .get("type")
        .orElse(-1 as InteractionType);

      if (
        interactionType === InteractionType.PointerMove ||
        interactionType === InteractionType.PointerDown ||
        interactionType === InteractionType.PointerUp
      ) {
        continue;
      }

      const typeNameMap: Record<number, string> = {
        [InteractionType.Click]: "click",
        [InteractionType.DoubleClick]: "doubleClick",
        [InteractionType.KeyDown]: "keyDown",
        [InteractionType.KeyUp]: "keyUp",
        [InteractionType.Scroll]: "scroll",
        [InteractionType.PageTransition]: "pageTransition",
        [InteractionType.ViewportResize]: "viewportResize",
      };
      const typeName = typeNameMap[interactionType];
      if (typeName && eventTypeFilter && !eventTypeFilter.includes(typeName))
        continue;

      if (
        interactionType === InteractionType.Click ||
        interactionType === InteractionType.DoubleClick
      ) {
        flushKeystrokes();
        const label = interactionData
          .get("meta")
          .get("humanReadableLabel")
          .orElse(null);
        const at = interactionData.get("at").orElse([0, 0]);
        const eventType =
          interactionType === InteractionType.Click ? "click" : "doubleClick";
        if (detail === "full") {
          resultEvents.push({
            time,
            type: eventType,
            ...(label ? { label } : {}),
            at: { x: at[0], y: at[1] },
          });
        } else {
          resultEvents.push({
            time,
            type: eventType,
            ...(label ? { label } : {}),
          });
        }
      } else if (interactionType === InteractionType.KeyDown) {
        if (detail === "summary") continue;
        const key = interactionData.get("key").orElse("");
        pendingKeys.push({ time, key });
      } else if (interactionType === InteractionType.KeyUp) {
        continue;
      } else if (interactionType === InteractionType.Scroll) {
        flushKeystrokes();
        if (detail === "summary") continue;
        const target = interactionData.get("target").orElse("");
        const to = interactionData.get("to").orElse([0, 0]);
        if (detail === "full") {
          const from = interactionData.get("from").orElse([0, 0]);
          resultEvents.push({
            time,
            type: "scroll",
            target,
            from: { x: from[0], y: from[1] },
            to: { x: to[0], y: to[1] },
          });
        } else {
          resultEvents.push({
            time,
            type: "scroll",
            target,
            to: { x: to[0], y: to[1] },
          });
        }
      } else if (interactionType === InteractionType.PageTransition) {
        flushKeystrokes();
        const from = interactionData.get("from").orElse(null);
        const to = interactionData.get("to").orElse("");
        resultEvents.push({
          time,
          type: "pageTransition",
          ...(from ? { from } : {}),
          to,
        });
      } else if (interactionType === InteractionType.ViewportResize) {
        flushKeystrokes();
        if (detail === "summary") continue;
        const to = interactionData.get("to").orElse([0, 0]);
        if (detail === "full") {
          const from = interactionData.get("from").orElse([0, 0]);
          resultEvents.push({
            time,
            type: "viewportResize",
            from: { width: from[0], height: from[1] },
            to: { width: to[0], height: to[1] },
          });
        } else {
          resultEvents.push({
            time,
            type: "viewportResize",
            to: { width: to[0], height: to[1] },
          });
        }
      }
      continue;
    }

    if (isDOMPatchEvent(event)) {
      if (eventTypeFilter && !eventTypeFilter.includes("domPatch")) continue;
      const bucket = Math.floor(time / 1000);
      domPatchBuckets[bucket] = (domPatchBuckets[bucket] ?? 0) + 1;
      continue;
    }

    if (event.match((e) => e.type === SourceEventType.Snapshot)) continue;

    if (isNetworkEvent(event)) {
      if (eventTypeFilter && !eventTypeFilter.includes("network")) continue;
      flushKeystrokes();
      resultEvents.push({ time, type: "network" });
      continue;
    }

    if (isConsoleEvent(event)) {
      if (eventTypeFilter && !eventTypeFilter.includes("console")) continue;
      flushKeystrokes();
      const consoleEvent: Box<ConsoleEvent> = event;
      const level = consoleEvent.get("data").get("level").orElse(LogLevel.Info);
      resultEvents.push({
        time,
        type: "console",
        level: LOG_LEVEL_NAMES[level] ?? "info",
      });
      continue;
    }

    if (event.match((e) => e.type === SourceEventType.Performance)) {
      if (eventTypeFilter && !eventTypeFilter.includes("performance")) continue;
      flushKeystrokes();
      resultEvents.push({ time, type: "performance" });
      continue;
    }
  }

  flushKeystrokes();

  let limitedEvents = resultEvents;
  if (resultEvents.length > limit) {
    limitedEvents = resultEvents.slice(0, limit);
    hasMore = true;
  }

  if (detail === "summary") {
    const counts: Record<string, number> = {};
    for (const ev of resultEvents) {
      const t = ev["type"] as string;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const totalDomPatches = Object.values(domPatchBuckets).reduce(
      (a, b) => a + b,
      0,
    );
    if (totalDomPatches > 0) {
      counts["domPatch"] = totalDomPatches;
    }
    const totalEvents = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      totalEvents,
      counts,
      durationMs: recording.getDuration(),
      _tokenEstimate: Math.ceil(JSON.stringify(counts).length / 4) + 20,
    };
  }

  const domActivity: Array<{ window: string; patchCount: number }> = [];
  const bucketKeys = Object.keys(domPatchBuckets)
    .map(Number)
    .sort((a, b) => a - b);
  for (const bucket of bucketKeys) {
    const count = domPatchBuckets[bucket]!;
    domActivity.push({
      window: `${bucket}-${bucket + 1}s`,
      patchCount: count,
    });
  }

  return {
    events: limitedEvents,
    ...(domActivity.length > 0 ? { domActivity } : {}),
    ...(hasMore ? { hasMore: true } : {}),
    _tokenEstimate:
      Math.ceil(JSON.stringify(limitedEvents).length / 4) +
      (domActivity.length > 0
        ? Math.ceil(JSON.stringify(domActivity).length / 4)
        : 0) +
      10,
  };
};
