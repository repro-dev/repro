import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, tools } from "../index";
import {
  makeAccessor,
  makeEmptyAccessor,
  makeSimpleSnapshot,
  makeSnapshotWithMissingRoot,
  runFuture,
} from "./helpers";

describe("tools array — getDOMState", () => {
  it("tool definition is included in tools array", async () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name === "getDOMState",
    );
    assert.ok(def !== undefined);
  });
});

describe("executeTool — getDOMState — errors", () => {
  it("returns error when no snapshot available", async () => {
    const accessor = makeEmptyAccessor();
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 1000,
    })) as { error: string };
    assert.ok(typeof result.error === "string");
    assert.ok(result.error.includes("No DOM snapshot"));
  });

  it("returns reason and suggestion when no DOM snapshot available", async () => {
    const accessor = makeEmptyAccessor();
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 1000,
    })) as { error: string; reason: string; suggestion: string };
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok(result.suggestion.includes("getRecordingDuration"));
  });

  it("returns error with reason and suggestion when a11y tree cannot be built", async () => {
    const accessor = makeAccessor(
      [],
      0,
      () =>
        makeSnapshotWithMissingRoot() as unknown as ReturnType<
          typeof makeSimpleSnapshot
        >,
    );
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 0,
      mode: "a11y",
    })) as { error: string; reason: string; suggestion: string };
    assert.ok(typeof result.error === "string");
    assert.ok(result.error.includes("accessibility tree"));
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok(result.suggestion.includes("summary"));
  });

  it("includes _tokenEstimate when a11y tree cannot be built", async () => {
    const accessor = makeAccessor(
      [],
      0,
      () =>
        makeSnapshotWithMissingRoot() as unknown as ReturnType<
          typeof makeSimpleSnapshot
        >,
    );
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 0,
      mode: "a11y",
    })) as { _tokenEstimate: number };
    assert.ok(typeof result._tokenEstimate === "number");
  });
});

describe("executeTool — getDOMState — a11y mode", () => {
  it("returns a11y tree for simple DOM in a11y mode", async () => {
    const accessor = makeAccessor([], 0, () => makeSimpleSnapshot());
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 0,
      mode: "a11y",
    })) as { mode: string; tree: string; timestampMs: number };
    assert.strictEqual(result.mode, "a11y");
    assert.ok(typeof result.tree === "string");
    assert.ok(result.tree.includes("button"));
    assert.strictEqual(result.timestampMs, 0);
  });

  it("defaults to a11y mode when mode not specified", async () => {
    const accessor = makeAccessor([], 0, () => makeSimpleSnapshot());
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 500,
    })) as { mode: string };
    assert.strictEqual(result.mode, "a11y");
  });

  it("includes _tokenEstimate in a11y mode response", async () => {
    const accessor = makeAccessor([], 0, () => makeSimpleSnapshot());
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 0,
      mode: "a11y",
    })) as { _tokenEstimate: number };
    assert.ok(typeof result._tokenEstimate === "number");
    assert.ok(result._tokenEstimate > 0);
  });
});

describe("executeTool — getDOMState — summary mode", () => {
  it("returns summary mode with element counts", async () => {
    const accessor = makeAccessor([], 0, () => makeSimpleSnapshot());
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 0,
      mode: "summary",
    })) as {
      mode: string;
      elementCount: number;
      textCount: number;
      topTags: Array<{ tag: string; count: number }>;
    };
    assert.strictEqual(result.mode, "summary");
    assert.ok(typeof result.elementCount === "number");
    assert.ok(result.elementCount > 0);
    assert.ok(Array.isArray(result.topTags));
  });

  it("includes _tokenEstimate in summary mode response", async () => {
    const accessor = makeAccessor([], 0, () => makeSimpleSnapshot());
    const result = await runFuture(executeTool(accessor, "getDOMState", {
      timestampMs: 0,
      mode: "summary",
    })) as { _tokenEstimate: number };
    assert.ok(typeof result._tokenEstimate === "number");
    assert.ok(result._tokenEstimate > 0);
  });
});
