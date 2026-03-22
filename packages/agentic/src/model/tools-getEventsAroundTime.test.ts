import { InteractionType, LogLevel, SourceEvent, SourceEventType } from "@repro/domain";
import assert from "node:assert";
import { describe, it } from "node:test";
import { RecordingDataAccessor } from "../types";
import { executeTool } from "./tools";

type DeepBoxable = Record<string, unknown>;

function makeBox<T>(value: T): {
  match: (fn: (v: T) => boolean) => boolean;
  get: <K extends keyof T>(key: K) => ReturnType<typeof makeBox<T[K]>>;
  orElse: <U>(other: U) => T | U;
  map: <R>(fn: (v: T) => R) => ReturnType<typeof makeBox<R>>;
  flat: () => ReturnType<typeof makeBox<T>>;
} {
  return {
    match: (fn) => (value != null ? fn(value) : false),
    get: (key) =>
      makeBox((value as DeepBoxable)[key as string] as T[typeof key]),
    orElse: (other) => (value == null ? other : value),
    map: (fn) =>
      makeBox(
        value != null ? fn(value) : (null as unknown as ReturnType<typeof fn>),
      ),
    flat: () => makeBox(value),
  };
}

function makeEvent(type: SourceEventType, time: number, data: DeepBoxable) {
  return makeBox({ type, time, data });
}

function makeClickEvent(time: number, label: string | null = null) {
  return makeEvent(SourceEventType.Interaction, time, {
    type: InteractionType.Click,
    meta: { humanReadableLabel: label },
  });
}

function makeDoubleClickEvent(time: number, label: string | null = null) {
  return makeEvent(SourceEventType.Interaction, time, {
    type: InteractionType.DoubleClick,
    meta: { humanReadableLabel: label },
  });
}

function makeKeyDownEvent(time: number, key: string) {
  return makeEvent(SourceEventType.Interaction, time, {
    type: InteractionType.KeyDown,
    key,
  });
}

function makeKeyUpEvent(time: number, key: string) {
  return makeEvent(SourceEventType.Interaction, time, {
    type: InteractionType.KeyUp,
    key,
  });
}

function makePointerEvent(time: number, interactionType: InteractionType) {
  return makeEvent(SourceEventType.Interaction, time, {
    type: interactionType,
  });
}

function makeScrollEvent(time: number, target: string) {
  return makeEvent(SourceEventType.Interaction, time, {
    type: InteractionType.Scroll,
    target,
  });
}

function makePageTransitionEvent(
  time: number,
  from: string | null,
  to: string,
) {
  return makeEvent(SourceEventType.Interaction, time, {
    type: InteractionType.PageTransition,
    from,
    to,
  });
}

function makeViewportResizeEvent(time: number, width: number, height: number) {
  return makeEvent(SourceEventType.Interaction, time, {
    type: InteractionType.ViewportResize,
    to: [width, height],
  });
}

function makeDOMPatchEvent(time: number) {
  return makeEvent(SourceEventType.DOMPatch, time, {});
}

function makeNetworkEvent(time: number) {
  return makeEvent(SourceEventType.Network, time, {});
}

function makeConsoleEvent(time: number, level: LogLevel, text: string) {
  return makeEvent(SourceEventType.Console, time, {
    level,
    parts: [makeBox({ type: 0, value: text }) as unknown as DeepBoxable],
    stack: [],
  });
}

function makeSnapshotEvent(time: number) {
  return makeEvent(SourceEventType.Snapshot, time, {});
}

function makePerformanceEvent(time: number) {
  return makeEvent(SourceEventType.Performance, time, {});
}

type MockEvent = ReturnType<typeof makeEvent>;

function makeAccessor(
  events: MockEvent[],
  duration = 10000,
): RecordingDataAccessor {
  return {
    getDuration: () => duration,
    getSnapshotAtTime: () => null,
    getEventsByType: (types, opts) => {
      const results: Array<SourceEvent> = []
      for (const event of events) {
        const type = event.get('type').orElse(-1 as SourceEventType)
        if (!types.includes(type as SourceEventType)) continue
        const time = event.get('time').orElse(0)
        if (opts?.startMs !== undefined && time < opts.startMs) continue
        if (opts?.endMs !== undefined && time > opts.endMs) continue
        results.push(event as unknown as SourceEvent)
      }
      return results
    },
    getEventsInRange: (startMs, endMs, opts) => {
      const results: Array<SourceEvent> = []
      for (const event of events) {
        const time = event.get('time').orElse(0)
        if (time < startMs) continue
        if (time > endMs) break
        if (opts?.types && opts.types.length > 0) {
          const type = event.get('type').orElse(-1 as SourceEventType)
          if (!opts.types.includes(type as SourceEventType)) continue
        }
        results.push(event as unknown as SourceEvent)
      }
      return results
    },
  }
}

describe("executeTool — getEventsAroundTime", () => {
  it("includes getEventsAroundTime in tools array", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tools } = require("./tools") as {
      tools: Array<{ function: { name: string } }>;
    };
    const def = tools.find((t) => t.function.name === "getEventsAroundTime");
    assert.ok(def !== undefined);
  });

  it("returns events within the default 5000ms window", () => {
    const events = [
      makeClickEvent(0),
      makeClickEvent(2500),
      makeClickEvent(5000),
      makeClickEvent(6000),
      makeClickEvent(8000),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
    }) as {
      events: Array<{ timeMs: number; type: string }>;
      windowMs: number;
      rangeStartMs: number;
      rangeEndMs: number;
    };

    assert.strictEqual(result.windowMs, 5000);
    assert.strictEqual(result.rangeStartMs, 2500);
    assert.strictEqual(result.rangeEndMs, 7500);
    const times = result.events.map((e) => e.timeMs);
    assert.ok(!times.includes(0), "should not include events before window");
    assert.ok(times.includes(2500));
    assert.ok(times.includes(5000));
    assert.ok(times.includes(6000));
    assert.ok(!times.includes(8000), "should not include events after window");
  });

  it("respects custom windowMs", () => {
    const events = [
      makeClickEvent(3000),
      makeClickEvent(4500),
      makeClickEvent(5000),
      makeClickEvent(5500),
      makeClickEvent(7000),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 2000,
    }) as {
      events: Array<{ timeMs: number }>;
      rangeStartMs: number;
      rangeEndMs: number;
    };

    assert.strictEqual(result.rangeStartMs, 4000);
    assert.strictEqual(result.rangeEndMs, 6000);
    const times = result.events.map((e) => e.timeMs);
    assert.ok(!times.includes(3000));
    assert.ok(times.includes(4500));
    assert.ok(times.includes(5000));
    assert.ok(times.includes(5500));
    assert.ok(!times.includes(7000));
  });

  it("clamps window start to 0 when near start of recording", () => {
    const events = [makeClickEvent(200)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 500,
      windowMs: 5000,
    }) as { rangeStartMs: number };

    assert.strictEqual(result.rangeStartMs, 0);
  });

  it("clamps window end to recording duration", () => {
    const events = [makeClickEvent(9800)];
    const accessor = makeAccessor(events, 10000);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 9500,
      windowMs: 5000,
    }) as { rangeEndMs: number };

    assert.strictEqual(result.rangeEndMs, 10000);
  });

  it("excludes PointerMove, PointerDown, PointerUp events", () => {
    const events = [
      makePointerEvent(5000, InteractionType.PointerMove),
      makePointerEvent(5001, InteractionType.PointerDown),
      makePointerEvent(5002, InteractionType.PointerUp),
      makeClickEvent(5003),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string; timeMs: number }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "click");
    assert.strictEqual(result.events[0]!.timeMs, 5003);
  });

  it("excludes DOMPatch events", () => {
    const events = [makeDOMPatchEvent(5000), makeClickEvent(5001)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "click");
  });

  it("excludes Snapshot events", () => {
    const events = [makeSnapshotEvent(5000), makeClickEvent(5001)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "click");
  });

  it("includes click with humanReadableLabel", () => {
    const events = [makeClickEvent(5000, "Submit button")];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string; label?: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "click");
    assert.strictEqual(result.events[0]!.label, "Submit button");
  });

  it("includes click without label when humanReadableLabel is null", () => {
    const events = [makeClickEvent(5000, null)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string; label?: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "click");
    assert.strictEqual(result.events[0]!.label, undefined);
  });

  it("includes console events with text", () => {
    const events = [
      makeConsoleEvent(5000, LogLevel.Error, "Something went wrong"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string; level: string; text: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "console");
    assert.strictEqual(result.events[0]!.level, "error");
    assert.strictEqual(result.events[0]!.text, "Something went wrong");
  });

  it("includes keyDown events individually", () => {
    const events = [makeKeyDownEvent(5000, "Enter")];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string; key: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "keyDown");
    assert.strictEqual(result.events[0]!.key, "Enter");
  });

  it("excludes keyUp events", () => {
    const events = [makeKeyDownEvent(5000, "a"), makeKeyUpEvent(5001, "a")];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "keyDown");
  });

  it("includes pageTransition with from and to", () => {
    const events = [makePageTransitionEvent(5000, "/home", "/about")];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string; from?: string; to: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "pageTransition");
    assert.strictEqual(result.events[0]!.from, "/home");
    assert.strictEqual(result.events[0]!.to, "/about");
  });

  it("returns empty events array when no events in window", () => {
    const events = [makeClickEvent(1000), makeClickEvent(9000)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 100,
    }) as { events: Array<unknown> };

    assert.strictEqual(result.events.length, 0);
  });

  it("returns correct response metadata shape", () => {
    const accessor = makeAccessor([]);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 2000,
    }) as {
      centerMs: number;
      windowMs: number;
      rangeStartMs: number;
      rangeEndMs: number;
      events: unknown[];
      _tokenEstimate: number;
    };

    assert.strictEqual(result.centerMs, 5000);
    assert.strictEqual(result.windowMs, 2000);
    assert.strictEqual(result.rangeStartMs, 4000);
    assert.strictEqual(result.rangeEndMs, 6000);
    assert.ok(Array.isArray(result.events));
    assert.ok(typeof result._tokenEstimate === "number");
  });

  it("includes network events", () => {
    const events = [makeNetworkEvent(5000)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "network");
  });

  it("includes performance events", () => {
    const events = [makePerformanceEvent(5000)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "performance");
  });

  it("includes doubleClick events", () => {
    const events = [makeDoubleClickEvent(5000, "Image")];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string; label?: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "doubleClick");
    assert.strictEqual(result.events[0]!.label, "Image");
  });

  it("includes scroll events", () => {
    const events = [makeScrollEvent(5000, "42")];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as { events: Array<{ type: string; target: string }> };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "scroll");
    assert.strictEqual(result.events[0]!.target, "42");
  });

  it("includes viewportResize events", () => {
    const events = [makeViewportResizeEvent(5000, 1280, 720)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 5000,
      windowMs: 1000,
    }) as {
      events: Array<{ type: string; to: { width: number; height: number } }>;
    };

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]!.type, "viewportResize");
    assert.deepStrictEqual(result.events[0]!.to, { width: 1280, height: 720 });
  });

  it("returns structured error when timestamp is below 0", () => {
    const accessor = makeAccessor([], 10000);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: -1,
    }) as { error: string; reason: string; suggestion: string };
    assert.ok(result.error.includes("-1ms"));
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok(result.suggestion.includes("getRecordingDuration"));
  });

  it("returns structured error when timestamp exceeds recording duration", () => {
    const accessor = makeAccessor([], 10000);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 99999,
    }) as { error: string; reason: string; suggestion: string };
    assert.ok(result.error.includes("99999ms"));
    assert.ok(result.error.includes("10000ms"));
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok(result.suggestion.includes("getRecordingDuration"));
  });

  it("does not return error when timestamp is exactly 0", () => {
    const accessor = makeAccessor([], 10000);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 0,
    }) as { events?: unknown[]; error?: string };
    assert.strictEqual(result.error, undefined);
    assert.ok(Array.isArray(result.events));
  });

  it("does not return error when timestamp equals recording duration", () => {
    const accessor = makeAccessor([], 10000);
    const result = executeTool(accessor, "getEventsAroundTime", {
      timestampMs: 10000,
    }) as { events?: unknown[]; error?: string };
    assert.strictEqual(result.error, undefined);
    assert.ok(Array.isArray(result.events));
  });
});
