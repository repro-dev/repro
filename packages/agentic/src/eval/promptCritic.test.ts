import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { CritiqueItem } from "./introspector";

// Helper to build a critiquesByFixture entry
function makeCritiquesEntry(
  fixtureName: string,
  runs: Array<{
    runIndex: number;
    correct: boolean;
    critiques: Array<CritiqueItem>;
  }>,
) {
  return { fixtureName, runs };
}

function makeCritique(
  issue = "Agent missed the network failure",
): CritiqueItem {
  return {
    issue,
    likelyPromptCause: "System prompt does not mention network errors",
    suggestion: "Add explicit instruction to check network errors first",
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
    const critiquesByFixture = [
      makeCritiquesEntry("fixture-a", [
        { runIndex: 0, correct: true, critiques: [] },
      ]),
    ];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      critiquesByFixture,
      "fake-key",
      "SOME_PROMPT",
    );
    assert.deepEqual(suggestions, []);
  });
});

// ── 2. Returns empty array when API returns non-array JSON ────────────────────

describe("suggestPromptImprovements — non-array JSON", () => {
  it("returns empty array when API returns a JSON object (not array)", async () => {
    mockFetch(JSON.stringify({ suggestions: [] }));
    const { suggestPromptImprovements } = await import("./promptCritic.js");
    const critiquesByFixture = [
      makeCritiquesEntry("fixture-a", [
        { runIndex: 0, correct: true, critiques: [] },
      ]),
    ];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      critiquesByFixture,
      "fake-key",
      "SOME_PROMPT",
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
    const critiquesByFixture = [
      makeCritiquesEntry("fixture-a", [
        { runIndex: 0, correct: false, critiques: [makeCritique()] },
      ]),
    ];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      critiquesByFixture,
      "fake-key",
      "MY_PROMPT",
    );
    assert.equal(suggestions.length, 1);
    // target is always overridden to promptExportName
    assert.equal(suggestions[0]!.target, "MY_PROMPT");
    assert.equal(suggestions[0]!.currentText, "old text");
    assert.equal(suggestions[0]!.suggestedText, "new text");
    assert.equal(suggestions[0]!.rationale, "Better clarity");
  });
});

// ── 4. Includes critique findings in prompt sent to API ───────────────────────

describe("suggestPromptImprovements — prompt content", () => {
  it("includes fixture name, run correctness, and critique items in user message", async () => {
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
    const critiquesByFixture = [
      makeCritiquesEntry("my-fixture", [
        {
          runIndex: 0,
          correct: false,
          critiques: [makeCritique("unique-issue-text-xyz")],
        },
        { runIndex: 1, correct: true, critiques: [] },
      ]),
    ];
    await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      critiquesByFixture,
      "fake-key",
      "SOME_PROMPT",
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
      userMsg!.content.includes("unique-issue-text-xyz"),
      "user message should include critique issue text",
    );
  });

  it("strips markdown code fences before parsing", async () => {
    const suggestion = makeSuggestion();
    // Wrap in markdown code fences as some models do
    mockFetch("```json\n" + JSON.stringify([suggestion]) + "\n```");
    const { suggestPromptImprovements } = await import("./promptCritic.js");
    const critiquesByFixture = [
      makeCritiquesEntry("fixture-a", [
        { runIndex: 0, correct: true, critiques: [] },
      ]),
    ];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      critiquesByFixture,
      "fake-key",
      "ENFORCED_PROMPT",
    );
    assert.equal(suggestions.length, 1);
    // target is always overridden to promptExportName, regardless of model output
    assert.equal(suggestions[0]!.target, "ENFORCED_PROMPT");
  });
});

// ── 5. Returns empty array when API request fails ─────────────────────────────

describe("suggestPromptImprovements — API error", () => {
  it("returns empty array when API returns non-ok status", async () => {
    mockFetch("Internal Server Error", false);
    const { suggestPromptImprovements } = await import("./promptCritic.js");
    const critiquesByFixture = [
      makeCritiquesEntry("fixture-a", [
        { runIndex: 0, correct: true, critiques: [] },
      ]),
    ];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      critiquesByFixture,
      "fake-key",
      "SOME_PROMPT",
    );
    assert.deepEqual(suggestions, []);
  });
});

// ── 6. Enforces promptExportName as target on all suggestions ─────────────────

describe("suggestPromptImprovements — promptExportName enforcement", () => {
  it("enforces promptExportName as target on all suggestions regardless of model output", async () => {
    // Mock returns a suggestion with the wrong target
    const wrongTargetSuggestion = {
      target: "WRONG_TARGET",
      currentText: "old text",
      suggestedText: "new text",
      rationale: "Better clarity",
    };
    mockFetch(JSON.stringify([wrongTargetSuggestion]));
    const { suggestPromptImprovements } = await import("./promptCritic.js");
    const critiquesByFixture = [
      makeCritiquesEntry("fixture-a", [
        { runIndex: 0, correct: false, critiques: [makeCritique()] },
      ]),
    ];
    const suggestions = await suggestPromptImprovements(
      "system prompt text",
      [{ name: "findErrors", description: "Find errors" }],
      critiquesByFixture,
      "fake-key",
      "EXTENSION_SYSTEM_CARD_MESSAGE",
    );
    assert.equal(suggestions.length, 1);
    // Target should be overridden to the promptExportName, not the model's hallucinated value
    assert.equal(suggestions[0]!.target, "EXTENSION_SYSTEM_CARD_MESSAGE");
  });
});
