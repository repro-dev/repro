import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInvestigationSummary,
  normalizeHypotheses,
  sortHypothesesByConfidence,
} from "./investigationStage";
import type { Hypothesis } from "./types";

describe("sortHypothesesByConfidence", () => {
  it("sorts hypotheses with high confidence first", () => {
    const hypotheses: Array<Hypothesis> = [
      {
        id: "h2",
        description: "Medium confidence",
        evidence: ["some evidence"],
        confidence: "medium",
      },
      {
        id: "h1",
        description: "High confidence",
        evidence: ["strong evidence"],
        confidence: "high",
      },
    ];

    const sorted = sortHypothesesByConfidence(hypotheses);

    assert.equal(sorted[0]?.confidence, "high");
    assert.equal(sorted[1]?.confidence, "medium");
  });

  it("orders as high > medium > low", () => {
    const hypotheses: Array<Hypothesis> = [
      { id: "h3", description: "Low", evidence: [], confidence: "low" },
      { id: "h1", description: "High", evidence: [], confidence: "high" },
      { id: "h2", description: "Medium", evidence: [], confidence: "medium" },
    ];

    const sorted = sortHypothesesByConfidence(hypotheses);

    assert.equal(sorted[0]?.confidence, "high");
    assert.equal(sorted[1]?.confidence, "medium");
    assert.equal(sorted[2]?.confidence, "low");
  });

  it("preserves relative order for equal confidence (stable sort)", () => {
    const hypotheses: Array<Hypothesis> = [
      { id: "h1", description: "A", evidence: [], confidence: "medium" },
      { id: "h2", description: "B", evidence: [], confidence: "medium" },
    ];

    const sorted = sortHypothesesByConfidence(hypotheses);

    assert.equal(sorted[0]?.id, "h1");
    assert.equal(sorted[1]?.id, "h2");
  });

  it("returns a new array (does not mutate input)", () => {
    const hypotheses: Array<Hypothesis> = [
      { id: "h1", description: "Low", evidence: [], confidence: "low" },
    ];

    const sorted = sortHypothesesByConfidence(hypotheses);

    assert.notStrictEqual(sorted, hypotheses);
  });

  it("handles empty array", () => {
    const sorted = sortHypothesesByConfidence([]);
    assert.deepEqual(sorted, []);
  });

  it("handles single hypothesis", () => {
    const hypotheses: Array<Hypothesis> = [
      { id: "h1", description: "Only one", evidence: [], confidence: "high" },
    ];

    const sorted = sortHypothesesByConfidence(hypotheses);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0]?.id, "h1");
  });
});

describe("buildInvestigationSummary", () => {
  it("returns top hypothesis description and confidence", () => {
    const hypotheses: Array<Hypothesis> = [
      {
        id: "h1",
        description: "Network failure",
        evidence: [],
        confidence: "high",
      },
    ];

    const summary = buildInvestigationSummary(hypotheses);

    assert.match(summary, /Network failure/);
    assert.match(summary, /high/);
  });

  it("uses the highest confidence hypothesis as top", () => {
    const hypotheses: Array<Hypothesis> = [
      { id: "h1", description: "Low conf", evidence: [], confidence: "low" },
      { id: "h2", description: "High conf", evidence: [], confidence: "high" },
    ];

    const summary = buildInvestigationSummary(hypotheses);

    assert.match(summary, /High conf/);
    assert.match(summary, /high/);
  });

  it("returns fallback message for empty hypotheses", () => {
    const summary = buildInvestigationSummary([]);
    assert.match(summary, /did not produce any hypotheses/);
  });
});

describe("normalizeHypotheses confidence defaulting", () => {
  it("defaults missing confidence to medium", () => {
    const result = normalizeHypotheses([
      { id: "h1", description: "Test", evidence: ["e1"] },
    ]);

    assert.ok(!("error" in result));
    if ("hypotheses" in result) {
      assert.equal(result.hypotheses[0]?.confidence, "medium");
    }
  });

  it("accepts valid confidence values", () => {
    const result = normalizeHypotheses([
      {
        id: "h1",
        description: "Test",
        evidence: ["e1"],
        confidence: "high",
      },
      {
        id: "h2",
        description: "Test 2",
        evidence: ["e2"],
        confidence: "low",
      },
    ]);

    assert.ok(!("error" in result));
    if ("hypotheses" in result) {
      assert.equal(result.hypotheses[0]?.confidence, "high");
      assert.equal(result.hypotheses[1]?.confidence, "low");
    }
  });

  it("defaults invalid confidence to medium", () => {
    const result = normalizeHypotheses([
      {
        id: "h1",
        description: "Test",
        evidence: ["e1"],
        confidence: "very-high",
      },
    ]);

    assert.ok(!("error" in result));
    if ("hypotheses" in result) {
      assert.equal(result.hypotheses[0]?.confidence, "medium");
    }
  });
});
