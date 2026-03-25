import { LogLevel } from "@repro/domain";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, tools } from "../index";
import { makeAccessor, makeConsoleEvent, makeEmptyAccessor, runFuture } from "./helpers";

describe("tools array — getConsoleMessages", () => {
  it("includes getConsoleMessages tool definition", async () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getConsoleMessages",
    );
    assert.ok(def !== undefined);
  });

  it("includes detail parameter with summary/normal/full enum", async () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getConsoleMessages",
    ) as {
      function: {
        parameters: { properties: Record<string, { enum?: string[] }> };
      };
    };
    assert.ok(def !== undefined);
    assert.deepStrictEqual(def.function.parameters.properties["detail"]!.enum, [
      "summary",
      "normal",
      "full",
    ]);
  });
});

describe("executeTool — getConsoleMessages — empty", () => {
  it("returns empty messages array with summary and _tokenEstimate", async () => {
    const accessor = makeEmptyAccessor();
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {})) as {
      messages: unknown[];
      summary: {
        verbose: number;
        info: number;
        warning: number;
        error: number;
      };
      _tokenEstimate: number;
    };
    assert.deepStrictEqual(result.messages, []);
    assert.ok(result.summary !== undefined);
    assert.ok(typeof result._tokenEstimate === "number");
  });
});

describe("executeTool — getConsoleMessages — summary tier", () => {
  it("returns only error messages, max 3", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Info, "info message"),
      makeConsoleEvent(200, LogLevel.Warning, "warning message"),
      makeConsoleEvent(300, LogLevel.Error, "error one"),
      makeConsoleEvent(400, LogLevel.Error, "error two"),
      makeConsoleEvent(500, LogLevel.Error, "error three"),
      makeConsoleEvent(600, LogLevel.Error, "error four"),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "summary",
    })) as { messages: Array<{ level: string }> };
    assert.ok(result.messages.every((m) => m.level === "error"));
    assert.ok(result.messages.length <= 3);
  });

  it("truncates text to 100 chars", async () => {
    const longText = "a".repeat(150);
    const events = [makeConsoleEvent(100, LogLevel.Error, longText)];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "summary",
    })) as { messages: Array<{ text: string }> };
    assert.ok(result.messages[0]!.text.length <= 100);
    assert.ok(result.messages[0]!.text.endsWith("…"));
  });

  it("omits stack traces", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Error, "error", [
        {
          fileName: "https://cdn.example.com/app.js",
          lineNumber: 10,
          columnNumber: 5,
        },
      ]),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "summary",
    })) as { messages: Array<{ stack?: unknown }> };
    assert.ok(result.messages[0]!.stack === undefined);
  });

  it("deduplicates identical messages with count", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Error, "same error"),
      makeConsoleEvent(200, LogLevel.Error, "same error"),
      makeConsoleEvent(300, LogLevel.Error, "same error"),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "summary",
    })) as { messages: Array<{ text: string; count: number; timeMs: number }> };
    assert.strictEqual(result.messages.length, 1);
    assert.strictEqual(result.messages[0]!.count, 3);
    assert.strictEqual(result.messages[0]!.timeMs, 100);
  });
});

describe("executeTool — getConsoleMessages — normal tier", () => {
  it("includes errors and warnings", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Verbose, "verbose message"),
      makeConsoleEvent(200, LogLevel.Info, "info message"),
      makeConsoleEvent(300, LogLevel.Warning, "warning message"),
      makeConsoleEvent(400, LogLevel.Error, "error message"),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "normal",
    })) as { messages: Array<{ level: string }> };
    const levels = result.messages.map((m) => m.level);
    assert.ok(levels.includes("warning"));
    assert.ok(levels.includes("error"));
    assert.ok(!levels.includes("verbose"));
    assert.ok(!levels.includes("info"));
  });

  it("truncates text to 200 chars", async () => {
    const longText = "b".repeat(300);
    const events = [makeConsoleEvent(100, LogLevel.Warning, longText)];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "normal",
    })) as { messages: Array<{ text: string }> };
    assert.ok(result.messages[0]!.text.length <= 200);
    assert.ok(result.messages[0]!.text.endsWith("…"));
  });

  it("shortens stack frames to basename:line:col format, max 3 frames", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Warning, "warn", [
        {
          fileName: "https://cdn.example.com/static/js/ProductList.tsx",
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          fileName: "https://cdn.example.com/static/js/renderWithHooks.js",
          lineNumber: 18,
          columnNumber: 5,
        },
        {
          fileName: "https://cdn.example.com/static/js/App.tsx",
          lineNumber: 10,
          columnNumber: 3,
        },
        {
          fileName: "https://cdn.example.com/static/js/index.js",
          lineNumber: 1,
          columnNumber: 1,
        },
      ]),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "normal",
    })) as { messages: Array<{ stack?: string[] }> };
    const stack = result.messages[0]!.stack!;
    assert.ok(Array.isArray(stack));
    assert.ok(stack.length <= 3);
    assert.strictEqual(stack[0], "ProductList.tsx:42:10");
    assert.strictEqual(stack[1], "renderWithHooks.js:18:5");
  });

  it("deduplicates identical messages with count", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Warning, "same warning"),
      makeConsoleEvent(200, LogLevel.Warning, "same warning"),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "normal",
    })) as { messages: Array<{ text: string; count: number }> };
    assert.strictEqual(result.messages.length, 1);
    assert.strictEqual(result.messages[0]!.count, 2);
  });

  it("default detail is normal when not specified", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Verbose, "verbose"),
      makeConsoleEvent(200, LogLevel.Info, "info"),
      makeConsoleEvent(300, LogLevel.Warning, "warning"),
      makeConsoleEvent(400, LogLevel.Error, "error"),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {})) as {
      messages: Array<{ level: string }>;
    };
    const levels = result.messages.map((m) => m.level);
    assert.ok(levels.includes("warning"));
    assert.ok(levels.includes("error"));
    assert.ok(!levels.includes("verbose"));
    assert.ok(!levels.includes("info"));
  });
});

describe("executeTool — getConsoleMessages — full tier", () => {
  it("includes all messages at requested level", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Verbose, "verbose message"),
      makeConsoleEvent(200, LogLevel.Info, "info message"),
      makeConsoleEvent(300, LogLevel.Warning, "warning message"),
      makeConsoleEvent(400, LogLevel.Error, "error message"),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "full",
      logLevel: "verbose",
    })) as { messages: Array<{ level: string }> };
    const levels = result.messages.map((m) => m.level);
    assert.ok(levels.includes("verbose"));
    assert.ok(levels.includes("info"));
    assert.ok(levels.includes("warning"));
    assert.ok(levels.includes("error"));
  });

  it("truncates text to 500 chars", async () => {
    const longText = "c".repeat(600);
    const events = [makeConsoleEvent(100, LogLevel.Info, longText)];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "full",
      logLevel: "info",
    })) as { messages: Array<{ text: string }> };
    assert.ok(result.messages[0]!.text.length <= 500);
    assert.ok(result.messages[0]!.text.endsWith("…"));
  });

  it("includes stack frames up to 10 with no dedup", async () => {
    const stack = Array.from({ length: 12 }, (_, i) => ({
      fileName: `https://cdn.example.com/file${i}.js`,
      lineNumber: i + 1,
      columnNumber: 1,
    }));
    const events = [
      makeConsoleEvent(100, LogLevel.Error, "error one", stack),
      makeConsoleEvent(200, LogLevel.Error, "error one", stack),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "full",
    })) as {
      messages: Array<{ text: string; stack?: string[]; count?: number }>;
    };
    assert.strictEqual(result.messages.length, 2);
    assert.ok(result.messages[0]!.count === undefined);
    assert.ok(result.messages[0]!.stack!.length <= 10);
  });
});

describe("executeTool — getConsoleMessages — cross-tier", () => {
  it("all tiers include summary with level counts", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Verbose, "v1"),
      makeConsoleEvent(200, LogLevel.Info, "i1"),
      makeConsoleEvent(300, LogLevel.Info, "i2"),
      makeConsoleEvent(400, LogLevel.Warning, "w1"),
      makeConsoleEvent(500, LogLevel.Error, "e1"),
      makeConsoleEvent(600, LogLevel.Error, "e2"),
      makeConsoleEvent(700, LogLevel.Error, "e3"),
    ];
    const accessor = makeAccessor(events);
    for (const detail of ["summary", "normal", "full"] as const) {
      const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
        detail,
        logLevel: "verbose",
      })) as {
        summary: {
          verbose: number;
          info: number;
          warning: number;
          error: number;
        };
      };
      assert.ok(result.summary !== undefined, `${detail} should have summary`);
      assert.strictEqual(result.summary.verbose, 1, `${detail} verbose count`);
      assert.strictEqual(result.summary.info, 2, `${detail} info count`);
      assert.strictEqual(result.summary.warning, 1, `${detail} warning count`);
      assert.strictEqual(result.summary.error, 3, `${detail} error count`);
    }
  });

  it("all tiers include _tokenEstimate", async () => {
    const events = [makeConsoleEvent(100, LogLevel.Error, "error message")];
    const accessor = makeAccessor(events);
    for (const detail of ["summary", "normal", "full"] as const) {
      const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
        detail,
      })) as { _tokenEstimate: number };
      assert.ok(
        typeof result._tokenEstimate === "number",
        `${detail} should have _tokenEstimate`,
      );
      assert.ok(result._tokenEstimate > 0, `${detail} _tokenEstimate > 0`);
    }
  });

  it("time range filtering works with detail parameter", async () => {
    const events = [
      makeConsoleEvent(100, LogLevel.Error, "early error"),
      makeConsoleEvent(500, LogLevel.Error, "mid error"),
      makeConsoleEvent(900, LogLevel.Error, "late error"),
    ];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      detail: "normal",
      timeRangeStartMs: 200,
      timeRangeEndMs: 700,
    })) as { messages: Array<{ text: string }> };
    assert.strictEqual(result.messages.length, 1);
    assert.ok(result.messages[0]!.text.includes("mid error"));
  });

  it("returns _hint when messages are empty and logLevel filter was provided", async () => {
    const events = [makeConsoleEvent(100, LogLevel.Info, "info message")];
    const accessor = makeAccessor(events);
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {
      logLevel: "error",
    })) as { messages: unknown[]; _hint?: string };
    assert.strictEqual(result.messages.length, 0);
    assert.ok(result._hint);
    assert.ok(result._hint.includes("getConsoleMessages"));
  });

  it("does not return _hint when no logLevel filter and messages are empty", async () => {
    const accessor = makeEmptyAccessor();
    const result = await runFuture(executeTool(accessor, "getConsoleMessages", {})) as {
      messages: unknown[];
      _hint?: string;
    };
    assert.strictEqual(result.messages.length, 0);
    assert.strictEqual(result._hint, undefined);
  });
});
