import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, tools } from "../index";
import {
  makeAccessor,
  makeClickEvent,
  makeConsoleErrorEvent,
  makeDOMPatchEvent,
  makeEmptyAccessor,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
  runFuture,
} from "./helpers";

// ─── Registration ─────────────────────────────────────────────────────────────

describe("tools array — findUserFrustration", () => {
  it("includes findUserFrustration tool definition", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "findUserFrustration",
    );
    assert.ok(def !== undefined);
  });

  it("has no required parameters", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "findUserFrustration",
    ) as
      | {
          function: {
            parameters: { required?: string[] };
          };
        }
      | undefined;
    assert.ok(def !== undefined);
    const required = def.function.parameters.required;
    assert.ok(required === undefined || required.length === 0);
  });
});

// ─── Empty recording ──────────────────────────────────────────────────────────

describe("executeTool — findUserFrustration — empty recording", () => {
  it("returns empty signals array for recording with no events", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: unknown[] };
    assert.deepStrictEqual(result.signals, []);
  });
});

// ─── Rage click ───────────────────────────────────────────────────────────────

describe("executeTool — findUserFrustration — rage click", () => {
  it("detects 3 rapid clicks at similar coordinates within 1000ms", async () => {
    const events = [
      makeClickEvent(0, null, [100, 200]),
      makeClickEvent(300, null, [105, 205]),
      makeClickEvent(600, null, [102, 198]),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ timeMs: number; type: string; summary: string }> };
    const rageclicks = result.signals.filter((s) => s.type === "rage_click");
    assert.strictEqual(rageclicks.length, 1);
    assert.strictEqual(rageclicks[0]!.timeMs, 0);
    assert.ok(rageclicks[0]!.summary.includes("3"));
  });

  it("does not detect rage click when clicks far apart in coordinates (> 50px)", async () => {
    const events = [
      makeClickEvent(0, null, [100, 200]),
      makeClickEvent(300, null, [200, 200]),
      makeClickEvent(600, null, [300, 200]),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const rageclicks = result.signals.filter((s) => s.type === "rage_click");
    assert.strictEqual(rageclicks.length, 0);
  });

  it("does not detect rage click when clicks spread over > 1000ms", async () => {
    const events = [
      makeClickEvent(0, null, [100, 200]),
      makeClickEvent(600, null, [102, 202]),
      makeClickEvent(1200, null, [103, 203]),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const rageclicks = result.signals.filter((s) => s.type === "rage_click");
    assert.strictEqual(rageclicks.length, 0);
  });
});

// ─── Dead click ───────────────────────────────────────────────────────────────

describe("executeTool — findUserFrustration — dead click", () => {
  it("detects dead click when no DOMPatch or PageTransition follows within 500ms", async () => {
    const events = [
      makeClickEvent(1000, null, [100, 200]),
      // No DOMPatch or PageTransition in the 500ms window
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ timeMs: number; type: string; summary: string }> };
    const deadClicks = result.signals.filter((s) => s.type === "dead_click");
    assert.strictEqual(deadClicks.length, 1);
    assert.strictEqual(deadClicks[0]!.timeMs, 1000);
    assert.ok(deadClicks[0]!.summary.includes("100"));
  });

  it("does not flag click when DOMPatch follows within 500ms", async () => {
    const events = [
      makeClickEvent(1000, null, [100, 200]),
      makeDOMPatchEvent(1200),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const deadClicks = result.signals.filter((s) => s.type === "dead_click");
    assert.strictEqual(deadClicks.length, 0);
  });

  it("does not flag click when PageTransition follows within 500ms", async () => {
    const events = [
      makeClickEvent(1000, null, [100, 200]),
      makePageTransitionEvent(1300, "https://example.com/page2"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const deadClicks = result.signals.filter((s) => s.type === "dead_click");
    assert.strictEqual(deadClicks.length, 0);
  });

  it("does not flag click when DOMPatch occurs at exactly the boundary (t + 500ms)", async () => {
    const events = [
      makeClickEvent(1000, null, [100, 200]),
      makeDOMPatchEvent(1500), // exactly at boundary
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const deadClicks = result.signals.filter((s) => s.type === "dead_click");
    assert.strictEqual(deadClicks.length, 0);
  });

  it("flags click when DOMPatch precedes it (outside window)", async () => {
    const events = [
      makeDOMPatchEvent(500), // before the click — should not dominate
      makeClickEvent(1000, null, [100, 200]),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const deadClicks = result.signals.filter((s) => s.type === "dead_click");
    assert.strictEqual(deadClicks.length, 1);
  });

  it("handles multiple sequential dead clicks without false negatives", async () => {
    // Two isolated dead clicks — no DOM changes follow either within 500ms
    const events = [
      makeClickEvent(0, null, [10, 10]),
      makeClickEvent(5000, null, [20, 20]),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const deadClicks = result.signals.filter((s) => s.type === "dead_click");
    assert.strictEqual(deadClicks.length, 2);
  });

  it("correctly separates dead clicks when one is dominated but another is not", async () => {
    const events = [
      makeClickEvent(0, null, [10, 10]),
      makeDOMPatchEvent(200), // dominates first click
      makeClickEvent(5000, null, [20, 20]),
      // no DOMPatch in [5000, 5500]
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ timeMs: number; type: string }> };
    const deadClicks = result.signals.filter((s) => s.type === "dead_click");
    assert.strictEqual(deadClicks.length, 1);
    assert.strictEqual(deadClicks[0]!.timeMs, 5000);
  });
});

// ─── Rapid navigation ─────────────────────────────────────────────────────────

describe("executeTool — findUserFrustration — rapid navigation", () => {
  it("detects 3+ page transitions within 5000ms", async () => {
    const events = [
      makePageTransitionEvent(0, "https://example.com/page1"),
      makePageTransitionEvent(1000, "https://example.com/page2"),
      makePageTransitionEvent(2000, "https://example.com/page3"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as {
      signals: Array<{
        timeMs: number;
        type: string;
        summary: string;
        details?: string;
      }>;
    };
    const rapidNavs = result.signals.filter(
      (s) => s.type === "rapid_navigation",
    );
    assert.strictEqual(rapidNavs.length, 1);
    assert.strictEqual(rapidNavs[0]!.timeMs, 0);
    assert.ok(rapidNavs[0]!.summary.includes("3"));
  });

  it("does not flag when transitions spread out beyond 5000ms", async () => {
    const events = [
      makePageTransitionEvent(0, "https://example.com/page1"),
      makePageTransitionEvent(3000, "https://example.com/page2"),
      makePageTransitionEvent(6000, "https://example.com/page3"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const rapidNavs = result.signals.filter(
      (s) => s.type === "rapid_navigation",
    );
    assert.strictEqual(rapidNavs.length, 0);
  });
});

// ─── Error loop ───────────────────────────────────────────────────────────────

describe("executeTool — findUserFrustration — error loop", () => {
  it("detects 3+ identical console errors within 10000ms", async () => {
    const events = [
      makeConsoleErrorEvent(0, "TypeError: Cannot read property x"),
      makeConsoleErrorEvent(3000, "TypeError: Cannot read property x"),
      makeConsoleErrorEvent(6000, "TypeError: Cannot read property x"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as {
      signals: Array<{ timeMs: number; type: string; summary: string }>;
    };
    const errorLoops = result.signals.filter((s) => s.type === "error_loop");
    assert.strictEqual(errorLoops.length, 1);
    assert.ok(errorLoops[0]!.summary.includes("3"));
    assert.ok(
      errorLoops[0]!.summary.includes("TypeError") ||
        errorLoops[0]!.summary.includes("Cannot read"),
    );
  });

  it("detects 3+ identical network failures within 10000ms", async () => {
    const events = [
      makeFetchRequestEvent(0, "req1", "https://example.com/api/data", "GET"),
      makeFetchResponseEvent(100, "req1", 500),
      makeFetchRequestEvent(
        3000,
        "req2",
        "https://example.com/api/data",
        "GET",
      ),
      makeFetchResponseEvent(3100, "req2", 500),
      makeFetchRequestEvent(
        6000,
        "req3",
        "https://example.com/api/data",
        "GET",
      ),
      makeFetchResponseEvent(6100, "req3", 500),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as {
      signals: Array<{ timeMs: number; type: string; summary: string }>;
    };
    const errorLoops = result.signals.filter((s) => s.type === "error_loop");
    assert.strictEqual(errorLoops.length, 1);
    assert.ok(errorLoops[0]!.summary.includes("3"));
    assert.ok(
      errorLoops[0]!.summary.includes("500") ||
        errorLoops[0]!.summary.includes("/api/data"),
    );
  });

  it("does not flag distinct errors (not repeated)", async () => {
    const events = [
      makeConsoleErrorEvent(0, "Error A"),
      makeConsoleErrorEvent(1000, "Error B"),
      makeConsoleErrorEvent(2000, "Error C"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: Array<{ type: string }> };
    const errorLoops = result.signals.filter((s) => s.type === "error_loop");
    assert.strictEqual(errorLoops.length, 0);
  });
});

// ─── Mixed signals ────────────────────────────────────────────────────────────

describe("executeTool — findUserFrustration — mixed", () => {
  it("returns all signal types sorted by timeMs ascending", async () => {
    const events = [
      // Page transitions at t=5000 (rapid nav)
      makePageTransitionEvent(5000, "https://example.com/page1"),
      makePageTransitionEvent(6000, "https://example.com/page2"),
      makePageTransitionEvent(7000, "https://example.com/page3"),
      // Rage clicks at t=0
      makeClickEvent(0, null, [50, 50]),
      makeClickEvent(200, null, [52, 52]),
      makeClickEvent(400, null, [48, 48]),
      // Dead click at t=2000 (no DOM patch follows)
      makeClickEvent(2000, null, [300, 300]),
      // DOMPatch way later — outside 500ms window for the dead click
      makeDOMPatchEvent(3000),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as {
      signals: Array<{ timeMs: number; type: string }>;
    };
    // Signals should be sorted by timeMs ascending
    for (let i = 1; i < result.signals.length; i++) {
      assert.ok(result.signals[i]!.timeMs >= result.signals[i - 1]!.timeMs);
    }
    // All signal types present
    const types = result.signals.map((s) => s.type);
    assert.ok(types.includes("rage_click"));
    assert.ok(types.includes("dead_click"));
    assert.ok(types.includes("rapid_navigation"));
  });

  it("includes _tokenEstimate in result", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "findUserFrustration", {}),
    )) as { signals: unknown[]; _tokenEstimate: number };
    assert.strictEqual(typeof result._tokenEstimate, "number");
    assert.ok(result._tokenEstimate >= 0);
  });
});
