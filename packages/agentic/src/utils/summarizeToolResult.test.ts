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

  it("returns DOM state summary for getDOMState with timestampMs", () => {
    const result = summarizeToolResult(
      "getDOMState",
      JSON.stringify({ mode: "a11y", tree: "some tree", timestampMs: 1500 }),
    );
    assert.equal(result, "DOM state at 1500ms");
  });

  it("returns Completed for getDOMState with missing timestampMs", () => {
    const result = summarizeToolResult(
      "getDOMState",
      JSON.stringify({ mode: "a11y", tree: "some tree" }),
    );
    assert.equal(result, "Completed");
  });

  it("returns error count for findErrors", () => {
    const result = summarizeToolResult(
      "findErrors",
      JSON.stringify({
        errors: [1, 2, 3],
        summary: { console: 2, network: 1, total: 3 },
      }),
    );
    assert.equal(result, "Found 3 error(s)");
  });

  it("returns 0 errors for findErrors with empty errors array", () => {
    const result = summarizeToolResult(
      "findErrors",
      JSON.stringify({
        errors: [],
        summary: { console: 0, network: 0, total: 0 },
      }),
    );
    assert.equal(result, "Found 0 error(s)");
  });

  it("returns Completed for findErrors with missing errors field", () => {
    const result = summarizeToolResult(
      "findErrors",
      JSON.stringify({ summary: { total: 0 } }),
    );
    assert.equal(result, "Completed");
  });

  it("returns element details summary for getElementDetails with tagName", () => {
    const result = summarizeToolResult(
      "getElementDetails",
      JSON.stringify({
        element: { nodeId: "123", tagName: "button", attributes: {} },
        parents: [],
        siblings: [],
      }),
    );
    assert.equal(result, "Element details: button");
  });

  it("returns Completed for getElementDetails with missing element field", () => {
    const result = summarizeToolResult(
      "getElementDetails",
      JSON.stringify({ parents: [], siblings: [] }),
    );
    assert.equal(result, "Completed");
  });

  it("returns event count for getEvents", () => {
    const result = summarizeToolResult(
      "getEvents",
      JSON.stringify({ events: [1, 2, 3, 4] }),
    );
    assert.equal(result, "Found 4 event(s)");
  });

  it("returns 0 events for getEvents with empty events array", () => {
    const result = summarizeToolResult(
      "getEvents",
      JSON.stringify({ events: [] }),
    );
    assert.equal(result, "Found 0 event(s)");
  });

  it("returns Completed for getEvents with missing events field", () => {
    const result = summarizeToolResult(
      "getEvents",
      JSON.stringify({ totalEvents: 5, counts: {} }),
    );
    assert.equal(result, "Completed");
  });

  it("returns event count around time for getEventsAroundTime", () => {
    const result = summarizeToolResult(
      "getEventsAroundTime",
      JSON.stringify({
        centerMs: 2000,
        windowMs: 5000,
        events: [1, 2],
      }),
    );
    assert.equal(result, "Found 2 event(s) around 2000ms");
  });

  it("returns 0 events around time for getEventsAroundTime with empty events", () => {
    const result = summarizeToolResult(
      "getEventsAroundTime",
      JSON.stringify({ centerMs: 500, windowMs: 5000, events: [] }),
    );
    assert.equal(result, "Found 0 event(s) around 500ms");
  });

  it("returns Completed for getEventsAroundTime with missing events field", () => {
    const result = summarizeToolResult(
      "getEventsAroundTime",
      JSON.stringify({ centerMs: 500 }),
    );
    assert.equal(result, "Completed");
  });
});
