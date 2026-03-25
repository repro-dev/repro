import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, tools } from "../index";
import {
  makeAccessor,
  makeConsoleErrorEvent,
  makeConsoleInfoEvent,
  makeEmptyAccessor,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
} from "./helpers";

describe("tools array — findErrors", () => {
  it("includes findErrors tool definition", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name === "findErrors",
    );
    assert.ok(def !== undefined);
  });

  it("includes detail parameter with summary/normal/full enum", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name === "findErrors",
    ) as { function: { parameters: { properties: Record<string, unknown> } } };
    assert.ok(def !== undefined);
    const detail = def.function.parameters.properties["detail"] as {
      enum: string[];
    };
    assert.ok(detail !== undefined);
    assert.deepStrictEqual(detail.enum, ["summary", "normal", "full"]);
  });
});

describe("executeTool — findErrors — basic", () => {
  it("returns empty errors for recording with no errors", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: unknown[];
      summary: { console: number; network: number; total: number };
    };
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.summary, {
      console: 0,
      network: 0,
      total: 0,
    });
  });

  it("finds console errors", () => {
    const events = [
      makeConsoleErrorEvent(500, "TypeError: Cannot read property x"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: Array<{ time: number; source: string; summary: string }>;
      summary: { console: number; network: number; total: number };
    };
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0]!.source, "console");
    assert.strictEqual(result.errors[0]!.time, 500);
    assert.ok(result.errors[0]!.summary.includes("TypeError"));
    assert.strictEqual(result.summary.console, 1);
    assert.strictEqual(result.summary.total, 1);
  });

  it("excludes non-error console messages", () => {
    const events = [
      makeConsoleInfoEvent(100, "debug info"),
      makeConsoleErrorEvent(200, "real error"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: Array<{ source: string }>;
    };
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0]!.source, "console");
  });

  it("finds network errors (status >= 400)", () => {
    const events = [
      makeFetchRequestEvent(
        100,
        "req1",
        "https://example.com/api/users",
        "GET",
      ),
      makeFetchResponseEvent(200, "req1", 500),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: Array<{ time: number; source: string; summary: string }>;
      summary: { network: number };
    };
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0]!.source, "network");
    assert.ok(result.errors[0]!.summary.includes("500"));
    assert.ok(result.errors[0]!.summary.includes("GET"));
    assert.strictEqual(result.summary.network, 1);
  });

  it("excludes successful network requests", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/ok", "GET"),
      makeFetchResponseEvent(200, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: unknown[];
    };
    assert.strictEqual(result.errors.length, 0);
  });

  it("combines and sorts console and network errors chronologically", () => {
    const events = [
      makeConsoleErrorEvent(300, "Error after request"),
      makeFetchRequestEvent(100, "req1", "https://example.com/fail", "POST"),
      makeFetchResponseEvent(200, "req1", 500),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: Array<{ time: number; source: string }>;
    };
    assert.strictEqual(result.errors.length, 2);
    assert.strictEqual(result.errors[0]!.source, "network");
    assert.strictEqual(result.errors[0]!.time, 100);
    assert.strictEqual(result.errors[1]!.source, "console");
    assert.strictEqual(result.errors[1]!.time, 300);
  });

  it("filters by time range", () => {
    const events = [
      makeConsoleErrorEvent(100, "early error"),
      makeConsoleErrorEvent(500, "mid error"),
      makeConsoleErrorEvent(900, "late error"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {
      timeRangeStartMs: 200,
      timeRangeEndMs: 600,
    }) as {
      errors: Array<{ time: number }>;
    };
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0]!.time, 500);
  });

  it("uses pathname in network error summary", () => {
    const events = [
      makeFetchRequestEvent(
        100,
        "req1",
        "https://api.example.com/v2/users?page=1",
        "DELETE",
      ),
      makeFetchResponseEvent(200, "req1", 403),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: Array<{ summary: string }>;
    };
    assert.ok(result.errors[0]!.summary.includes("/v2/users"));
    assert.ok(result.errors[0]!.summary.includes("DELETE"));
    assert.ok(result.errors[0]!.summary.includes("403"));
  });
});

describe("executeTool — findErrors — normal tier (default)", () => {
  it("includes stack traces from console errors as basename:line:col", () => {
    const events = [
      makeConsoleErrorEvent(100, "TypeError", [
        {
          functionName: "render",
          fileName: "https://cdn.example.com/static/js/ProductList.abc123.js",
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          functionName: "processChild",
          fileName: "https://cdn.example.com/static/js/react-dom.prod.js",
          lineNumber: 1234,
          columnNumber: 5,
        },
      ]),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: Array<{ stack?: string[] }>;
    };
    assert.ok(result.errors[0]!.stack);
    assert.strictEqual(result.errors[0]!.stack!.length, 2);
    assert.strictEqual(
      result.errors[0]!.stack![0],
      "ProductList.abc123.js:42:10",
    );
    assert.strictEqual(result.errors[0]!.stack![1], "react-dom.prod.js:1234:5");
  });

  it("limits stack traces to 3 frames", () => {
    const frames = Array.from({ length: 5 }, (_, i) => ({
      functionName: `fn${i}`,
      fileName: `file${i}.js`,
      lineNumber: i + 1,
      columnNumber: 0,
    }));
    const events = [makeConsoleErrorEvent(100, "Error", frames)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: Array<{ stack?: string[] }>;
    };
    assert.strictEqual(result.errors[0]!.stack!.length, 3);
  });

  it("truncates long console error messages to 200 chars", () => {
    const longMessage = "x".repeat(300);
    const events = [makeConsoleErrorEvent(100, longMessage)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {}) as {
      errors: Array<{ summary: string }>;
    };
    assert.ok(result.errors[0]!.summary.length <= 201);
    assert.ok(result.errors[0]!.summary.endsWith("…"));
  });

  it("includes _tokenEstimate", () => {
    const events = [makeConsoleErrorEvent(100, "An error occurred")];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {
      detail: "normal",
    }) as {
      errors: unknown[];
      _tokenEstimate: number;
    };
    assert.strictEqual(typeof result._tokenEstimate, "number");
    assert.ok(result._tokenEstimate > 0);
  });
});

describe("executeTool — findErrors — summary tier", () => {
  it("returns counts and at most one error per source without stack frames", () => {
    const events = [
      makeConsoleErrorEvent(100, "First error"),
      makeConsoleErrorEvent(150, "Second error"),
      makeFetchRequestEvent(200, "req1", "https://example.com/api/fail", "GET"),
      makeFetchResponseEvent(300, "req1", 500),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", {
      detail: "summary",
    }) as {
      errors: Array<{
        time: number;
        source: string;
        summary: string;
        stack?: string[];
      }>;
      summary: { console: number; network: number; total: number };
      _tokenEstimate: number;
    };
    // At most one error per source (console + network)
    assert.ok(result.errors.length <= 2);
    // No stack frames on any entry
    for (const e of result.errors) {
      assert.ok(
        e.stack === undefined,
        "summary tier should not include stack frames",
      );
    }
    // Summary counts reflect all 3 errors, not just the representatives
    assert.strictEqual(result.summary.total, 3);
    assert.strictEqual(result.summary.console, 2);
    assert.strictEqual(result.summary.network, 1);
    // _tokenEstimate is a positive number
    assert.strictEqual(typeof result._tokenEstimate, "number");
    assert.ok(result._tokenEstimate > 0);
  });

  it("returns only counts when there are no errors", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "findErrors", {
      detail: "summary",
    }) as {
      errors: unknown[];
      summary: { console: number; network: number; total: number };
      _tokenEstimate: number;
    };
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.summary.total, 0);
    assert.strictEqual(typeof result._tokenEstimate, "number");
    assert.ok(result._tokenEstimate > 0);
  });
});

describe("executeTool — findErrors — full tier", () => {
  it("includes up to 10 stack frames", () => {
    const frames = Array.from({ length: 12 }, (_, i) => ({
      functionName: `fn${i}`,
      fileName: `file${i}.js`,
      lineNumber: i + 1,
      columnNumber: 0,
    }));
    const events = [
      makeConsoleErrorEvent(100, "Error with many frames", frames),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", { detail: "full" }) as {
      errors: Array<{ stack?: string[] }>;
    };
    assert.strictEqual(result.errors[0]!.stack!.length, 10);
  });

  it("does not truncate message at 200 chars", () => {
    const longMessage = "x".repeat(400);
    const events = [makeConsoleErrorEvent(100, longMessage)];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "findErrors", { detail: "full" }) as {
      errors: Array<{ summary: string }>;
    };
    assert.ok(result.errors[0]!.summary.length > 200);
  });
});
