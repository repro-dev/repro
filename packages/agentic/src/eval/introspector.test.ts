import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { EvalScore } from "./scorer";
import type { Entry } from "../types";

// ── helpers ─────────────────────────────────────────────────────────────────

function makeEntry(
  role: "user" | "assistant" | "tool" | "system",
  content: string,
): Entry {
  if (role === "assistant") {
    return { id: "a1", timestamp: new Date(), role, content, toolCalls: [] };
  }
  if (role === "tool") {
    return {
      id: "t1",
      timestamp: new Date(),
      role,
      content,
      tool_call_id: "tc1",
    };
  }
  return { id: "e1", timestamp: new Date(), role, content } as Entry;
}

function makeScore(overrides: Partial<EvalScore> = {}): EvalScore {
  return {
    correct: false,
    judgeReasoning: "The agent missed the network failure.",
    iterationDepth: 5,
    toolErrorRate: 0.2,
    hitIterationLimit: false,
    qualityScore: { brevity: 2, directness: 1, signalNoise: 2 },
    ...overrides,
  };
}

const TRANSCRIPT: Array<Entry> = [
  makeEntry("system", "You are a debugging agent."),
  makeEntry("user", "Why did the page fail?"),
  makeEntry("assistant", "Let me check the errors."),
  makeEntry("tool", '{"errors": []}'),
  makeEntry("assistant", "I found no errors."),
];

const TOOL_DESCRIPTIONS = [
  { name: "findErrors", description: "Finds errors in the recording." },
  { name: "getNetworkRequests", description: "Gets network request data." },
];

function mockFetchWithCritiques(
  items: Array<{
    issue: string;
    likelyPromptCause: string;
    suggestion: string;
  }>,
): void {
  mock.method(global, "fetch", async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(items) } }],
    }),
  }));
}

function mockFetchWithBody(body: string): void {
  mock.method(global, "fetch", async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: body } }],
    }),
  }));
}

// ── test: returns empty array on malformed JSON ──────────────────────────────

describe("critiqueRun — malformed JSON", () => {
  it("returns empty array when API returns malformed JSON", async () => {
    mockFetchWithBody("not-json-at-all {{ broken");
    const { critiqueRun } = await import("./introspector.js");
    const result = await critiqueRun(
      TRANSCRIPT,
      "You are a debugging agent.",
      TOOL_DESCRIPTIONS,
      makeScore(),
      "Find the network failure.",
      "fake-key",
    );
    assert.deepEqual(result, []);
  });
});

// ── test: returns empty array when API returns [] ────────────────────────────

describe("critiqueRun — empty array from API", () => {
  it("returns empty array when API returns []", async () => {
    mockFetchWithCritiques([]);
    const { critiqueRun } = await import("./introspector.js");
    const result = await critiqueRun(
      TRANSCRIPT,
      "You are a debugging agent.",
      TOOL_DESCRIPTIONS,
      makeScore(),
      "Find the network failure.",
      "fake-key",
    );
    assert.deepEqual(result, []);
  });
});

// ── test: returns parsed critique items on valid response ────────────────────

describe("critiqueRun — valid critique items", () => {
  it("returns parsed critique items when API returns valid array", async () => {
    const critiques = [
      {
        issue: "Agent did not check network requests",
        likelyPromptCause:
          "Tool notes section does not emphasise network as first step",
        suggestion:
          "Add a note to check network requests early in the methodology",
      },
    ];
    mockFetchWithCritiques(critiques);
    const { critiqueRun } = await import("./introspector.js");
    const result = await critiqueRun(
      TRANSCRIPT,
      "You are a debugging agent.",
      TOOL_DESCRIPTIONS,
      makeScore(),
      "Find the network failure.",
      "fake-key",
    );
    assert.equal(result.length, 1);
    assert.equal(result[0]!.issue, "Agent did not check network requests");
    assert.equal(
      result[0]!.likelyPromptCause,
      "Tool notes section does not emphasise network as first step",
    );
    assert.equal(
      result[0]!.suggestion,
      "Add a note to check network requests early in the methodology",
    );
  });
});

// ── test: passes transcript content to the API ───────────────────────────────

describe("critiqueRun — request body contains transcript", () => {
  it("passes transcript content to the API", async () => {
    let capturedBody: unknown = null;

    mock.method(global, "fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "[]" } }],
        }),
      };
    });

    const { critiqueRun } = await import("./introspector.js");
    const transcript: Array<Entry> = [
      makeEntry("user", "Why did the page fail?"),
      makeEntry(
        "assistant",
        "Let me investigate the unique-trace-content-xyz.",
      ),
    ];
    await critiqueRun(
      transcript,
      "You are a debugging agent.",
      TOOL_DESCRIPTIONS,
      makeScore(),
      "Find the network failure.",
      "fake-key",
    );

    assert.ok(capturedBody !== null, "fetch should have been called");
    const body = capturedBody as { messages: Array<{ content: string }> };
    const userMessage = body.messages.find(
      (m: { role?: string; content: string }) =>
        (m as { role?: string }).role === "user",
    );
    assert.ok(userMessage !== undefined, "user message should exist");
    assert.ok(
      userMessage.content.includes("unique-trace-content-xyz"),
      "transcript content should appear in request body",
    );
  });
});

// ── test: returns empty array when run was correct and quality was high ──────

describe("critiqueRun — correct and high-quality run", () => {
  it("returns empty array when API returns [] for a correct, high-quality run", async () => {
    mockFetchWithCritiques([]);
    const { critiqueRun } = await import("./introspector.js");
    const highQualityScore = makeScore({
      correct: true,
      qualityScore: { brevity: 3, directness: 3, signalNoise: 3 },
    });
    const result = await critiqueRun(
      TRANSCRIPT,
      "You are a debugging agent.",
      TOOL_DESCRIPTIONS,
      highQualityScore,
      "Find the network failure.",
      "fake-key",
    );
    assert.deepEqual(result, []);
  });
});
