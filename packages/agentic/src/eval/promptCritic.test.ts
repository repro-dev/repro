import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { EvalResult } from "./runner";

// Helper to build a minimal EvalResult for testing
function makeEvalResult(
  fixtureName: string,
  correctnessRate: number,
  judgeReasoning = "Looks correct",
): EvalResult {
  return {
    fixtureName,
    prompt: "debug this",
    runs: [
      {
        correct: correctnessRate > 0.5,
        judgeReasoning,
        iterationDepth: 5,
        toolErrorRate: 0.1,
        hitIterationLimit: false,
        qualityScore: { brevity: 2, directness: 2, signalNoise: 2 },
      },
    ],
    majorityCorrect: correctnessRate > 0.5,
    correctnessRate,
    averageIterationDepth: 5,
    averageToolErrorRate: 0.1,
    anyHitIterationLimit: false,
    averageQualityScore: { brevity: 2, directness: 2, signalNoise: 2 },
  };
}

function makeSuggestion() {
  return {
    target: "system.ts (SHARED_SYSTEM_CARD)",
    currentText: "old text",
    suggestedText: "new text",
    rationale: "Better clarity",
  };
}

function mockFetch(body: string, ok = true) {
  mock.method(global, "fetch", async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({
      choices: [{ message: { content: body } }],
    }),
  }));
}

// ── 1. Returns empty array when API returns malformed JSON ────────────────────

describe("suggestPromptImprovements — malformed JSON", () => {
  it("returns empty array when API returns malformed JSON", async () => {
    mockFetch("this is not json at all");
    const { suggestPromptImprovements } = await import("./promptCritic.js");
    const results: Array<EvalResult> = [makeEvalResult("fixture-a", 1.0)];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      results,
      "fake-key",
    );
    assert.deepEqual(suggestions, []);
  });
});

// ── 2. Returns empty array when API returns non-array JSON ────────────────────

describe("suggestPromptImprovements — non-array JSON", () => {
  it("returns empty array when API returns a JSON object (not array)", async () => {
    mockFetch(JSON.stringify({ suggestions: [] }));
    const { suggestPromptImprovements } = await import("./promptCritic.js");
    const results: Array<EvalResult> = [makeEvalResult("fixture-a", 1.0)];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      results,
      "fake-key",
    );
    assert.deepEqual(suggestions, []);
  });
});

// ── 3. Returns parsed suggestions when API returns valid JSON array ────────────

describe("suggestPromptImprovements — valid response", () => {
  it("returns parsed PromptSuggestion array when API returns valid JSON", async () => {
    const expectedSuggestions = [makeSuggestion()];
    mockFetch(JSON.stringify(expectedSuggestions));
    const { suggestPromptImprovements } = await import("./promptCritic.js");
    const results: Array<EvalResult> = [makeEvalResult("fixture-a", 1.0)];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      results,
      "fake-key",
    );
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0]!.target, "system.ts (SHARED_SYSTEM_CARD)");
    assert.equal(suggestions[0]!.currentText, "old text");
    assert.equal(suggestions[0]!.suggestedText, "new text");
    assert.equal(suggestions[0]!.rationale, "Better clarity");
  });
});

// ── 4. Includes fixture correctness data in prompt sent to API ────────────────

describe("suggestPromptImprovements — prompt content", () => {
  it("includes fixture name and correctnessRate in user message sent to API", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mock.method(global, "fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "[]" } }],
        }),
      };
    });

    const { suggestPromptImprovements } = await import("./promptCritic.js");
    const results: Array<EvalResult> = [
      makeEvalResult("my-fixture", 0.67, "Agent missed the network error"),
    ];
    await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      results,
      "fake-key",
    );

    assert.ok(capturedBody !== null, "fetch should have been called");
    const messages = capturedBody!["messages"] as Array<{
      role: string;
      content: string;
    }>;
    const userMsg = messages.find((m) => m.role === "user");
    assert.ok(userMsg, "should have a user message");
    assert.ok(
      userMsg!.content.includes("my-fixture"),
      "user message should include fixture name",
    );
    assert.ok(
      userMsg!.content.includes("67.0%") || userMsg!.content.includes("0.67"),
      "user message should include correctness rate",
    );
    assert.ok(
      userMsg!.content.includes("Agent missed the network error"),
      "user message should include judge reasoning",
    );
  });
});
