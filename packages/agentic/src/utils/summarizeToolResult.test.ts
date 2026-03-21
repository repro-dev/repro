import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeToolResult } from "./summarizeToolResult";

describe("summarizeToolResult", () => {
  it("returns duration for getRecordingDuration", () => {
    const result = summarizeToolResult(
      "getRecordingDuration",
      JSON.stringify({ duration: 42.5 }),
    );
    assert.equal(result, "Duration: 42.5s");
  });

  it("returns message count for getConsoleMessages", () => {
    const result = summarizeToolResult(
      "getConsoleMessages",
      JSON.stringify({ messages: [1, 2, 3] }),
    );
    assert.equal(result, "Found 3 message(s)");
  });

  it("returns singular count for getConsoleMessages with 1 item", () => {
    const result = summarizeToolResult(
      "getConsoleMessages",
      JSON.stringify({ messages: [1] }),
    );
    assert.equal(result, "Found 1 message(s)");
  });

  it("returns request count for getNetworkRequests", () => {
    const result = summarizeToolResult(
      "getNetworkRequests",
      JSON.stringify({ requests: [1, 2] }),
    );
    assert.equal(result, "Found 2 request(s)");
  });

  it("returns 0 for getNetworkRequests with empty array", () => {
    const result = summarizeToolResult(
      "getNetworkRequests",
      JSON.stringify({ requests: [] }),
    );
    assert.equal(result, "Found 0 request(s)");
  });

  it("returns error message for error results", () => {
    const result = summarizeToolResult(
      "getRecordingDuration",
      JSON.stringify({ error: "Tool timed out" }),
    );
    assert.equal(result, "Error: Tool timed out");
  });

  it("returns Completed for unknown tool names", () => {
    const result = summarizeToolResult(
      "unknownTool",
      JSON.stringify({ foo: "bar" }),
    );
    assert.equal(result, "Completed");
  });

  it("returns Completed when JSON parse fails", () => {
    const result = summarizeToolResult(
      "getRecordingDuration",
      "not-valid-json",
    );
    assert.equal(result, "Completed");
  });

  it("returns Completed for getConsoleMessages with missing messages field", () => {
    const result = summarizeToolResult(
      "getConsoleMessages",
      JSON.stringify({ other: "data" }),
    );
    assert.equal(result, "Completed");
  });

  it("returns Completed for getNetworkRequests with missing requests field", () => {
    const result = summarizeToolResult(
      "getNetworkRequests",
      JSON.stringify({ other: "data" }),
    );
    assert.equal(result, "Completed");
  });
});
