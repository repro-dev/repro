/**
 * Tests for findRegressions() — verifies threshold-based regression detection
 * across correctnessRate, avgErrorRate, and avgToolCalls.
 *
 * We test the pure logic extracted from the module via a narrow interface.
 * The full CLI entry point (main()) is intentionally untested here because it
 * requires a live OpenRouter API key and 7+ minute eval runs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPromptGroups } from "./index";
import { findRegressions } from "./regressions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseline(
  fixtureName: string,
  correctnessRate: number,
  avgErrorRate: number,
  avgToolCalls: number,
  avgQuality = 2.0,
) {
  return {
    fixtureName,
    correctnessRate,
    avgErrorRate,
    avgToolCalls,
    avgQuality,
  };
}

function makeResult(
  fixtureName: string,
  correctnessRate: number,
  avgErrorRate: number,
  avgToolCalls: number,
  compositeQualityScore = 2.0,
) {
  return {
    fixtureName,
    correctnessRate,
    averageToolErrorRate: avgErrorRate,
    averageIterationDepth: avgToolCalls,
    compositeQualityScore,
  };
}

// ---------------------------------------------------------------------------
// correctnessRate threshold — any drop is a regression
// ---------------------------------------------------------------------------

describe("findRegressions — correctnessRate", () => {
  it("flags a regression when correctnessRate drops", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.0, 5.0)];
    const results = [makeResult("fixture-a", 0.67, 0.0, 5.0)];
    const regressions = findRegressions(results, baseline);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0]!.fixtureName, "fixture-a");
    assert.equal(regressions[0]!.metric, "correctnessRate");
  });

  it("does not flag when correctnessRate is unchanged", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.0, 5.0)];
    const results = [makeResult("fixture-a", 1.0, 0.0, 5.0)];
    assert.equal(findRegressions(results, baseline).length, 0);
  });

  it("does not flag when correctnessRate improves", () => {
    const baseline = [makeBaseline("fixture-a", 0.67, 0.0, 5.0)];
    const results = [makeResult("fixture-a", 1.0, 0.0, 5.0)];
    assert.equal(findRegressions(results, baseline).length, 0);
  });
});

// ---------------------------------------------------------------------------
// avgErrorRate threshold — absolute +10pp tolerance
// ---------------------------------------------------------------------------

describe("findRegressions — avgErrorRate", () => {
  it("flags a regression when avgErrorRate exceeds baseline + 0.10", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.042, 5.0)];
    // 0.042 + 0.10 = 0.142; just above threshold
    const results = [makeResult("fixture-a", 1.0, 0.143, 5.0)];
    const regressions = findRegressions(results, baseline);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0]!.metric, "avgErrorRate");
  });

  it("does not flag when avgErrorRate is within tolerance (exactly at boundary)", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.042, 5.0)];
    // exactly at 0.042 + 0.10 = 0.142 — should NOT flag
    const results = [makeResult("fixture-a", 1.0, 0.142, 5.0)];
    assert.equal(findRegressions(results, baseline).length, 0);
  });

  it("does not flag when avgErrorRate decreases", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.1, 5.0)];
    const results = [makeResult("fixture-a", 1.0, 0.05, 5.0)];
    assert.equal(findRegressions(results, baseline).length, 0);
  });
});

// ---------------------------------------------------------------------------
// avgToolCalls threshold — absolute +3 call tolerance
// ---------------------------------------------------------------------------

describe("findRegressions — avgToolCalls", () => {
  it("flags a regression when avgToolCalls exceeds baseline + 3", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.0, 7.0)];
    // 7.0 + 3 = 10.0; just above threshold
    const results = [makeResult("fixture-a", 1.0, 0.0, 10.1)];
    const regressions = findRegressions(results, baseline);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0]!.metric, "avgToolCalls");
  });

  it("does not flag when avgToolCalls is within tolerance (exactly at boundary)", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.0, 7.0)];
    // exactly at 7.0 + 3 = 10.0 — should NOT flag
    const results = [makeResult("fixture-a", 1.0, 0.0, 10.0)];
    assert.equal(findRegressions(results, baseline).length, 0);
  });

  it("does not flag when avgToolCalls decreases", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.0, 7.0)];
    const results = [makeResult("fixture-a", 1.0, 0.0, 4.0)];
    assert.equal(findRegressions(results, baseline).length, 0);
  });
});

// ---------------------------------------------------------------------------
// New fixture — no baseline entry — not a regression
// ---------------------------------------------------------------------------

describe("findRegressions — new fixtures", () => {
  it("does not flag a fixture with no baseline entry", () => {
    const baseline: ReturnType<typeof makeBaseline>[] = [];
    const results = [makeResult("new-fixture", 0.0, 0.5, 20.0)];
    assert.equal(findRegressions(results, baseline).length, 0);
  });
});

// ---------------------------------------------------------------------------
// Multiple metrics breached — still one entry per fixture
// ---------------------------------------------------------------------------

describe("findRegressions — multiple metrics breached", () => {
  it("returns one regression entry per fixture, reports the first breached metric", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.0, 5.0)];
    const results = [makeResult("fixture-a", 0.67, 0.5, 20.0)];
    const regressions = findRegressions(results, baseline);
    // One entry per fixture even though all three metrics regressed
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0]!.fixtureName, "fixture-a");
  });

  it("captures the delta for reporting", () => {
    const baseline = [makeBaseline("fixture-a", 1.0, 0.042, 7.0)];
    const results = [makeResult("fixture-a", 1.0, 0.222, 7.0)];
    const regressions = findRegressions(results, baseline);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0]!.metric, "avgErrorRate");
    // delta = excess above threshold: 0.222 - (0.042 + 0.10) = 0.08
    assert.ok(regressions[0]!.delta > 0);
    assert.ok(regressions[0]!.delta < 0.1);
  });
});

// ---------------------------------------------------------------------------
// buildPromptGroups — groups critiquesByFixture by promptExportName
// ---------------------------------------------------------------------------

describe("buildPromptGroups", () => {
  it("makes one group per distinct promptExportName", () => {
    const fixtures = [
      {
        name: "fixture-a",
        prompt: "prompt a",
        expectedOutcomeDescription: "desc a",
        accessor: {} as never,
        systemPrompt: "system prompt A",
        promptExportName: "PROMPT_A",
      },
      {
        name: "fixture-b",
        prompt: "prompt b",
        expectedOutcomeDescription: "desc b",
        accessor: {} as never,
        systemPrompt: "system prompt B",
        promptExportName: "PROMPT_B",
      },
      {
        name: "fixture-c",
        prompt: "prompt c",
        expectedOutcomeDescription: "desc c",
        accessor: {} as never,
        systemPrompt: "system prompt A",
        promptExportName: "PROMPT_A",
      },
    ];
    const critiquesByFixture = [
      { fixtureName: "fixture-a", runs: [] },
      { fixtureName: "fixture-b", runs: [] },
      { fixtureName: "fixture-c", runs: [] },
    ];

    const groups = buildPromptGroups(fixtures, critiquesByFixture);

    // Two distinct promptExportNames → two groups
    assert.equal(groups.size, 2);
    assert.ok(groups.has("PROMPT_A"), "should have PROMPT_A group");
    assert.ok(groups.has("PROMPT_B"), "should have PROMPT_B group");

    // PROMPT_A group has two fixtures (fixture-a and fixture-c)
    assert.equal(groups.get("PROMPT_A")!.entries.length, 2);
    // PROMPT_B group has one fixture (fixture-b)
    assert.equal(groups.get("PROMPT_B")!.entries.length, 1);

    // systemPrompt is preserved per group
    assert.equal(groups.get("PROMPT_A")!.systemPrompt, "system prompt A");
    assert.equal(groups.get("PROMPT_B")!.systemPrompt, "system prompt B");
  });

  it("places all fixtures in one group when they share the same promptExportName", () => {
    const fixtures = [
      {
        name: "fixture-a",
        prompt: "p",
        expectedOutcomeDescription: "d",
        accessor: {} as never,
        systemPrompt: "shared prompt",
        promptExportName: "EXTENSION_SYSTEM_CARD_MESSAGE",
      },
      {
        name: "fixture-b",
        prompt: "p",
        expectedOutcomeDescription: "d",
        accessor: {} as never,
        systemPrompt: "shared prompt",
        promptExportName: "EXTENSION_SYSTEM_CARD_MESSAGE",
      },
    ];
    const critiquesByFixture = [
      { fixtureName: "fixture-a", runs: [] },
      { fixtureName: "fixture-b", runs: [] },
    ];

    const groups = buildPromptGroups(fixtures, critiquesByFixture);

    assert.equal(groups.size, 1);
    assert.ok(groups.has("EXTENSION_SYSTEM_CARD_MESSAGE"));
    assert.equal(
      groups.get("EXTENSION_SYSTEM_CARD_MESSAGE")!.entries.length,
      2,
    );
  });
});
