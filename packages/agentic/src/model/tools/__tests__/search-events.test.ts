import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PerformanceEntryType, SourceEventType } from "@repro/domain";
import { Box } from "@repro/tdl";
import { executeTool, tools } from "../index";
import {
  makeAccessor,
  makeAttributePatchEvent,
  makeClickEvent,
  makeConsoleInfoEvent,
  makeEmptyAccessor,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
  makeTextPatchEvent,
  runFuture,
} from "./helpers";

// ─── Local helper: performance event with real data ───────────────────────────

function makePerformanceResourceEvent(
  time: number,
  url: string,
  initiatorType = "fetch",
): Box<unknown> {
  return new Box({
    type: SourceEventType.Performance,
    time,
    data: new Box({
      type: PerformanceEntryType.ResourceTiming,
      id: "abcd",
      initiatorType,
      url,
      startTime: time,
      domainLookupStart: 0,
      domainLookupEnd: 0,
      connectStart: 0,
      secureConnectionStart: 0,
      connectEnd: 0,
      requestStart: 0,
      responseStart: 0,
      responseEnd: 0,
      encodedBodySize: 0,
      decodedBodySize: 0,
      transferSize: 0,
    }),
  }) as Box<unknown>;
}

// ─── Test: tool registration ──────────────────────────────────────────────────

describe("tools array — searchEvents", () => {
  it("is registered in the tools array", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name === "searchEvents",
    );
    assert.ok(def !== undefined, "searchEvents should be in tools array");
  });
});

// ─── Test: empty recording ────────────────────────────────────────────────────

describe("executeTool — searchEvents — empty recording", () => {
  it("returns empty matches when no events", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "anything" }),
    )) as { matches: unknown[] };
    assert.deepStrictEqual(result.matches, []);
  });
});

// ─── Test: console events ─────────────────────────────────────────────────────

describe("executeTool — searchEvents — console events", () => {
  it("finds console event by message text (case-insensitive)", async () => {
    const events = [
      makeConsoleInfoEvent(500, "TypeError: Cannot read property x"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "typeerror" }),
    )) as {
      matches: Array<{
        index: number;
        timeMs: number;
        type: string;
        summary: string;
        matchContext: string;
      }>;
      _tokenEstimate: number;
    };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "console");
    assert.strictEqual(result.matches[0]!.timeMs, 500);
    assert.ok(result.matches[0]!.summary.length > 0);
    assert.ok(
      typeof result._tokenEstimate === "number" && result._tokenEstimate >= 0,
      "_tokenEstimate should be a non-negative number",
    );
  });

  it("includes stack trace file names in search", async () => {
    const events = [
      (() => {
        const { Box: B } = require("@repro/tdl");
        const {
          SourceEventType: SET,
          LogLevel,
          MessagePartType,
        } = require("@repro/domain");
        return new B({
          type: SET.Console,
          time: 300,
          data: new B({
            level: LogLevel.Error,
            parts: [
              new B({
                type: MessagePartType.String,
                value: "Something went wrong",
              }),
            ],
            stack: [
              {
                functionName: "render",
                fileName:
                  "https://cdn.example.com/static/js/ProductList.abc123.js",
                lineNumber: 42,
                columnNumber: 10,
              },
            ],
          }),
        });
      })(),
    ];
    const accessor = makeAccessor(
      events as unknown as Array<
        ReturnType<typeof import("@repro/domain").SourceEventView.from>
      >,
    );
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "ProductList" }),
    )) as { matches: Array<{ type: string }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "console");
  });

  it("matchContext contains surrounding text around the match", async () => {
    const events = [
      makeConsoleInfoEvent(
        100,
        "Hello world this is a test message with some context around the match",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "world" }),
    )) as {
      matches: Array<{ matchContext: string }>;
    };
    assert.strictEqual(result.matches.length, 1);
    assert.ok(
      result.matches[0]!.matchContext.includes("world"),
      "matchContext should include the matched text",
    );
    // matchContext should be a substring of the full text with context around the match
    assert.ok(
      result.matches[0]!.matchContext.length > "world".length,
      "matchContext should include text around the match",
    );
  });
});

// ─── Test: network events ─────────────────────────────────────────────────────

describe("executeTool — searchEvents — network events", () => {
  it("finds network event by URL", async () => {
    const events = [
      makeFetchRequestEvent(
        100,
        "req1",
        "https://api.example.com/users",
        "GET",
      ),
      makeFetchResponseEvent(200, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "api.example.com" }),
    )) as { matches: Array<{ type: string; timeMs: number }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "network");
  });

  it("finds network event by HTTP method", async () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/data", "DELETE"),
      makeFetchResponseEvent(200, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "DELETE" }),
    )) as { matches: Array<{ type: string }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "network");
  });

  it("finds network event by status code", async () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/data", "GET"),
      makeFetchResponseEvent(200, "req1", 404),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "404" }),
    )) as { matches: Array<{ type: string }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "network");
  });
});

// ─── Test: interaction events ─────────────────────────────────────────────────

describe("executeTool — searchEvents — interaction events", () => {
  it("finds interaction event by humanReadableLabel", async () => {
    const events = [makeClickEvent(500, "Submit payment form")];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "payment" }),
    )) as { matches: Array<{ type: string; timeMs: number }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "interaction");
    assert.strictEqual(result.matches[0]!.timeMs, 500);
  });

  it("finds interaction event by page URL (PageTransition)", async () => {
    const events = [
      makePageTransitionEvent(
        300,
        "https://example.com/checkout",
        "https://example.com/cart",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "checkout" }),
    )) as { matches: Array<{ type: string }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "interaction");
  });
});

// ─── Test: DOM patch events ───────────────────────────────────────────────────

describe("executeTool — searchEvents — DOM patch events", () => {
  it("finds DOM patch by attribute name/value", async () => {
    const events = [
      makeAttributePatchEvent(400, "node01", "data-testid", "buy-button", null),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "buy-button" }),
    )) as { matches: Array<{ type: string }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "dom-patch");
  });

  it("finds DOM patch by text content", async () => {
    const events = [makeTextPatchEvent(600, "node02", "Hello World", "Hello")];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "Hello World" }),
    )) as { matches: Array<{ type: string }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "dom-patch");
  });
});

// ─── Test: performance events ─────────────────────────────────────────────────

describe("executeTool — searchEvents — performance events", () => {
  it("finds performance event by URL", async () => {
    const events = [
      makePerformanceResourceEvent(
        700,
        "https://cdn.example.com/static/bundle.js",
      ) as unknown as ReturnType<
        typeof import("@repro/domain").SourceEventView.from
      >,
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "bundle.js" }),
    )) as { matches: Array<{ type: string }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.type, "performance");
  });
});

// ─── Test: filtering options ──────────────────────────────────────────────────

describe("executeTool — searchEvents — filtering", () => {
  it("eventTypes filter restricts to specified types only", async () => {
    const events = [
      makeConsoleInfoEvent(100, "fetch error occurred"),
      makeFetchRequestEvent(200, "req1", "https://example.com/data", "GET"),
      makeFetchResponseEvent(300, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    // "fetch" appears in both console text and network URL, but we filter to console only
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", {
        query: "fetch",
        eventTypes: ["console"],
      }),
    )) as { matches: Array<{ type: string }> };
    // All matches should be console type only
    for (const match of result.matches) {
      assert.strictEqual(match.type, "console");
    }
    assert.strictEqual(result.matches.length, 1);
  });

  it("timeRangeStartMs/timeRangeEndMs restricts to time window", async () => {
    const events = [
      makeConsoleInfoEvent(100, "early message"),
      makeConsoleInfoEvent(500, "mid message"),
      makeConsoleInfoEvent(900, "late message"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", {
        query: "message",
        timeRangeStartMs: 200,
        timeRangeEndMs: 600,
      }),
    )) as { matches: Array<{ timeMs: number }> };
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0]!.timeMs, 500);
  });

  it("maxResults caps returned matches", async () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeConsoleInfoEvent(i * 100, `repeated search term ${i}`),
    );
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", {
        query: "repeated search term",
        maxResults: 3,
      }),
    )) as { matches: unknown[] };
    assert.strictEqual(result.matches.length, 3);
  });

  it("returns empty matches array (not error) when no events match", async () => {
    const events = [makeConsoleInfoEvent(100, "something unrelated")];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "searchEvents", { query: "xyzzy-not-found" }),
    )) as { matches: unknown[]; error?: string };
    assert.ok(!("error" in result), "should not return an error");
    assert.deepStrictEqual(result.matches, []);
  });
});
