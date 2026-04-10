import { LogLevel } from "@repro/domain";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, tools } from "../index";
import {
  makeAccessor,
  makeConsoleEvent,
  makeEmptyAccessor,
  runFuture,
} from "./helpers";

describe("tools array — getConsoleContext", () => {
  it("includes getConsoleContext tool definition", async () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getConsoleContext",
    );
    assert.ok(def !== undefined);
  });

  it("timestampMs is a required parameter", async () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getConsoleContext",
    ) as {
      function: {
        parameters: {
          required?: string[];
          properties: Record<string, unknown>;
        };
      };
    };
    assert.ok(def !== undefined);
    assert.ok(def.function.parameters.required?.includes("timestampMs"));
  });
});

describe("executeTool — getConsoleContext — empty recording", () => {
  it("returns empty messages array with _tokenEstimate", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", { timestampMs: 500 }),
    )) as {
      messages: unknown[];
      _tokenEstimate: number;
    };
    assert.deepStrictEqual(result.messages, []);
    assert.ok(typeof result._tokenEstimate === "number");
  });
});

describe("executeTool — getConsoleContext — default window", () => {
  it("uses default linesBefore=10 and linesAfter=5", async () => {
    // Create 20 events at 100ms intervals: indices 0-19
    const events = Array.from({ length: 20 }, (_, i) =>
      makeConsoleEvent((i + 1) * 100, LogLevel.Info, `message ${i}`),
    );
    const accessor = makeAccessor(events);

    // Use the timestamp of event at index 10 (time=1100ms) as pivot
    // With linesBefore=10: startIndex = max(0, 10 - 10) = 0
    // With linesAfter=5: endIndex = min(19, 10 + 5) = 15
    // Expected: events 0..15 inclusive = 16 messages
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", { timestampMs: 1100 }),
    )) as {
      messages: Array<{ timeMs: number; text: string }>;
      _tokenEstimate: number;
    };
    assert.strictEqual(result.messages.length, 16);
    assert.strictEqual(result.messages[0]!.timeMs, 100);
    assert.strictEqual(result.messages[15]!.timeMs, 1600);
  });
});

describe("executeTool — getConsoleContext — custom window", () => {
  it("respects custom linesBefore=2 and linesAfter=3", async () => {
    // 10 events at 100ms intervals: indices 0-9
    const events = Array.from({ length: 10 }, (_, i) =>
      makeConsoleEvent((i + 1) * 100, LogLevel.Info, `message ${i}`),
    );
    const accessor = makeAccessor(events);

    // Pivot at index 5 (time=600ms), linesBefore=2, linesAfter=3
    // startIndex = max(0, 5 - 2) = 3 → timeMs=400
    // endIndex = min(9, 5 + 3) = 8 → timeMs=900
    // Expected: events 3..8 inclusive = 6 messages
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 600,
        linesBefore: 2,
        linesAfter: 3,
      }),
    )) as {
      messages: Array<{ timeMs: number }>;
    };
    assert.strictEqual(result.messages.length, 6);
    assert.strictEqual(result.messages[0]!.timeMs, 400);
    assert.strictEqual(result.messages[5]!.timeMs, 900);
  });
});

describe("executeTool — getConsoleContext — pivot selection", () => {
  it("selects the nearest message to timestampMs", async () => {
    // Events at 100, 300, 700, 900
    // Timestamp 500 is equidistant from 300 and 700, but 700 is closer... wait:
    //   |500 - 100| = 400
    //   |500 - 300| = 200
    //   |500 - 700| = 200
    //   |500 - 900| = 400
    // Both 300 and 700 are equally close; first occurrence (300, index 1) is pivot.
    // With linesBefore=1, linesAfter=1: startIndex=0, endIndex=2
    // Messages: indices 0,1,2 → times 100,300,700
    const events = [
      makeConsoleEvent(100, LogLevel.Info, "msg 0"),
      makeConsoleEvent(300, LogLevel.Info, "msg 1"),
      makeConsoleEvent(700, LogLevel.Info, "msg 2"),
      makeConsoleEvent(900, LogLevel.Info, "msg 3"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 500,
        linesBefore: 1,
        linesAfter: 1,
      }),
    )) as {
      messages: Array<{ timeMs: number }>;
    };
    // Pivot is at index 1 (time=300) since it's the FIRST message with min diff
    assert.strictEqual(result.messages.length, 3);
    assert.strictEqual(result.messages[0]!.timeMs, 100);
    assert.strictEqual(result.messages[1]!.timeMs, 300);
    assert.strictEqual(result.messages[2]!.timeMs, 700);
  });
});

describe("executeTool — getConsoleContext — boundary clamping", () => {
  it("clamps at start boundary when linesBefore exceeds available messages", async () => {
    // 5 events; pivot at index 1, linesBefore=10
    // startIndex = max(0, 1 - 10) = 0
    // endIndex = min(4, 1 + 2) = 3
    // Expected: events 0..3 = 4 messages
    const events = Array.from({ length: 5 }, (_, i) =>
      makeConsoleEvent((i + 1) * 100, LogLevel.Info, `msg ${i}`),
    );
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 200, // index 1
        linesBefore: 10,
        linesAfter: 2,
      }),
    )) as {
      messages: Array<{ timeMs: number }>;
    };
    assert.strictEqual(result.messages[0]!.timeMs, 100);
    assert.ok(result.messages.length <= 5);
  });

  it("clamps at end boundary when linesAfter exceeds available messages", async () => {
    // 5 events; pivot at index 3 (time=400), linesAfter=10
    // startIndex = max(0, 3 - 1) = 2
    // endIndex = min(4, 3 + 10) = 4
    // Expected: events 2..4 = 3 messages
    const events = Array.from({ length: 5 }, (_, i) =>
      makeConsoleEvent((i + 1) * 100, LogLevel.Info, `msg ${i}`),
    );
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 400, // index 3
        linesBefore: 1,
        linesAfter: 10,
      }),
    )) as {
      messages: Array<{ timeMs: number }>;
    };
    assert.strictEqual(
      result.messages[result.messages.length - 1]!.timeMs,
      500,
    );
    assert.ok(result.messages.length <= 5);
  });
});

describe("executeTool — getConsoleContext — message shape", () => {
  it("includes timeMs, level, and text fields", async () => {
    const events = [makeConsoleEvent(250, LogLevel.Warning, "watch out")];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 250,
        linesBefore: 0,
        linesAfter: 0,
      }),
    )) as {
      messages: Array<{ timeMs: number; level: string; text: string }>;
    };
    assert.strictEqual(result.messages.length, 1);
    assert.strictEqual(result.messages[0]!.timeMs, 250);
    assert.strictEqual(result.messages[0]!.level, "warning");
    assert.strictEqual(result.messages[0]!.text, "watch out");
  });

  it("maps all log levels correctly", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Verbose, "verbose msg"),
      makeConsoleEvent(200, LogLevel.Info, "info msg"),
      makeConsoleEvent(300, LogLevel.Warning, "warning msg"),
      makeConsoleEvent(400, LogLevel.Error, "error msg"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 250,
        linesBefore: 10,
        linesAfter: 10,
      }),
    )) as {
      messages: Array<{ level: string }>;
    };
    const levels = result.messages.map((m) => m.level);
    assert.ok(levels.includes("verbose"));
    assert.ok(levels.includes("info"));
    assert.ok(levels.includes("warning"));
    assert.ok(levels.includes("error"));
  });
});

describe("executeTool — getConsoleContext — stack frames", () => {
  it("stack frames are structured objects with fileName, line, column", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Error, "error with stack", [
        {
          functionName: "handleClick",
          fileName: "https://cdn.example.com/app.js",
          lineNumber: 42,
          columnNumber: 10,
        },
      ]),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 100,
        linesBefore: 0,
        linesAfter: 0,
      }),
    )) as {
      messages: Array<{
        stack?: Array<{
          functionName?: string;
          fileName: string;
          line: number;
          column: number;
        }>;
      }>;
    };
    const msg = result.messages[0]!;
    assert.ok(Array.isArray(msg.stack));
    const frame = msg.stack![0]!;
    assert.strictEqual(frame.functionName, "handleClick");
    assert.strictEqual(frame.fileName, "https://cdn.example.com/app.js");
    assert.strictEqual(frame.line, 42);
    assert.strictEqual(frame.column, 10);
  });

  it("omits functionName when null or undefined", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Error, "error without fn name", [
        {
          // no functionName provided — helpers.ts sets it to null
          fileName: "https://cdn.example.com/app.js",
          lineNumber: 10,
          columnNumber: 5,
        },
      ]),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 100,
        linesBefore: 0,
        linesAfter: 0,
      }),
    )) as {
      messages: Array<{
        stack?: Array<Record<string, unknown>>;
      }>;
    };
    const frame = result.messages[0]!.stack![0]!;
    // functionName must NOT be present when null
    assert.ok(!("functionName" in frame));
  });

  it("omits stack field when no stack entries", async () => {
    const events = [makeConsoleEvent(100, LogLevel.Info, "no stack")];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", {
        timestampMs: 100,
        linesBefore: 0,
        linesAfter: 0,
      }),
    )) as {
      messages: Array<{ stack?: unknown }>;
    };
    assert.strictEqual(result.messages[0]!.stack, undefined);
  });
});

describe("executeTool — getConsoleContext — token estimate", () => {
  it("includes _tokenEstimate in result", async () => {
    const events = [makeConsoleEvent(100, LogLevel.Error, "error message")];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getConsoleContext", { timestampMs: 100 }),
    )) as { _tokenEstimate: number };
    assert.ok(typeof result._tokenEstimate === "number");
    assert.ok(result._tokenEstimate > 0);
  });
});
