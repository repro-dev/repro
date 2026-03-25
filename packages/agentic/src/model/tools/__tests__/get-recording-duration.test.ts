import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, tools } from "../index";
import { makeAccessor, makeEmptyAccessor } from "./helpers";

describe("tools array", () => {
  it("exports a non-empty array of tool definitions", () => {
    assert.ok(Array.isArray(tools));
    assert.ok(tools.length > 0);
  });

  it("includes getRecordingDuration tool definition", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getRecordingDuration",
    );
    assert.ok(def !== undefined);
  });

  it("getRecordingDuration tool includes detail parameter with enum", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getRecordingDuration",
    ) as {
      function: {
        parameters: {
          properties: Record<string, { type: string; enum?: string[] }>;
        };
      };
    };
    assert.ok(def !== undefined);
    assert.ok(def.function.parameters.properties["detail"] !== undefined);
    assert.deepStrictEqual(def.function.parameters.properties["detail"]!.enum, [
      "summary",
      "normal",
      "full",
    ]);
  });
});

describe("executeTool — getRecordingDuration", () => {
  it("returns duration from getDuration()", () => {
    const accessor = makeAccessor([], 9876);
    const result = executeTool(accessor, "getRecordingDuration", {}) as {
      durationMs: number;
      _tokenEstimate: number;
    };
    assert.strictEqual(result.durationMs, 9876);
  });

  it("includes _tokenEstimate in response", () => {
    const accessor = makeAccessor([], 9876);
    const result = executeTool(accessor, "getRecordingDuration", {}) as {
      durationMs: number;
      _tokenEstimate: number;
    };
    assert.ok(typeof result._tokenEstimate === "number");
    assert.ok(result._tokenEstimate > 0);
  });

  it("returns duration of 0 for empty recording", () => {
    const accessor = makeAccessor([], 0);
    const result = executeTool(accessor, "getRecordingDuration", {}) as {
      durationMs: number;
    };
    assert.strictEqual(result.durationMs, 0);
  });
});

describe("executeTool — unknown tool", () => {
  it("returns error for an unknown tool name", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "doesNotExist", {}) as {
      error: string;
    };
    assert.ok(result.error.includes("Unknown tool: doesNotExist"));
  });

  it("returns reason and suggestion for unknown tool", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "doesNotExist", {}) as {
      error: string;
      reason: string;
      suggestion: string;
    };
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok(result.suggestion.includes("getRecordingDuration"));
  });
});
