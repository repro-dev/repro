import { cleanup, render, screen } from "@testing-library/react";
import expect from "expect";
import { afterEach, describe, it } from "node:test";
import React from "react";
import type { Hypothesis } from "@repro/agentic";
import { HypothesisList } from "./HypothesisList";

afterEach(() => {
  cleanup();
});

function makeHypotheses(overrides: Partial<Hypothesis>[] = []): Hypothesis[] {
  return overrides.map((o, i) => ({
    id: o.id ?? `h${i + 1}`,
    description: o.description ?? `Hypothesis ${i + 1}`,
    evidence: o.evidence ?? [],
    confidence: (o.confidence ?? "medium") as "low" | "medium" | "high",
  }));
}

describe("HypothesisList", () => {
  it("renders nothing when hypotheses array is empty", () => {
    const { container } = render(<HypothesisList hypotheses={[]} />);
    expect(container.textContent).toBe("");
  });

  it("renders hypotheses ranked by confidence (high first)", () => {
    const hypotheses = makeHypotheses([
      { description: "Low hypothesis", confidence: "low" },
      { description: "High hypothesis", confidence: "high" },
      { description: "Medium hypothesis", confidence: "medium" },
    ]);

    render(<HypothesisList hypotheses={hypotheses} />);

    expect(screen.getByText("Investigation hypotheses")).toBeDefined();

    expect(screen.getByText("High hypothesis")).toBeDefined();
    expect(screen.getByText("Medium hypothesis")).toBeDefined();
    expect(screen.getByText("Low hypothesis")).toBeDefined();
  });

  it("renders confidence badges per hypothesis", () => {
    const hypotheses = makeHypotheses([
      {
        description: "High confidence hypothesis",
        confidence: "high",
        evidence: ["strong signal"],
      },
      {
        description: "Medium confidence guess",
        confidence: "medium",
        evidence: ["moderate signal"],
      },
      {
        description: "Low confidence hunch",
        confidence: "low",
        evidence: ["weak signal"],
      },
    ]);

    render(<HypothesisList hypotheses={hypotheses} />);

    const highBadges = screen.getAllByText("high");
    expect(highBadges.length).toBeGreaterThanOrEqual(1);
    const mediumBadges = screen.getAllByText("medium");
    expect(mediumBadges.length).toBeGreaterThanOrEqual(1);
    const lowBadges = screen.getAllByText("low");
    expect(lowBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows uncertainty message when top hypothesis has low confidence", () => {
    const hypotheses = makeHypotheses([
      { description: "Only hypothesis", confidence: "low" },
    ]);

    render(<HypothesisList hypotheses={hypotheses} />);

    expect(
      screen.getByText(/top hypothesis has low confidence/i),
    ).toBeDefined();
  });

  it("does not show uncertainty message when top hypothesis has high confidence", () => {
    const hypotheses = makeHypotheses([
      {
        description: "Strong hypothesis",
        confidence: "high",
        evidence: ["e1"],
      },
    ]);

    render(<HypothesisList hypotheses={hypotheses} />);

    expect(screen.queryByText(/top hypothesis has low confidence/i)).toBeNull();
  });

  it("collapses evidence by default for non-top hypotheses", () => {
    const hypotheses = makeHypotheses([
      { description: "Top", confidence: "high", evidence: ["e1"] },
      { description: "Second", confidence: "medium", evidence: ["e2"] },
    ]);

    render(<HypothesisList hypotheses={hypotheses} />);

    expect(screen.getByText("e1")).toBeDefined();
  });

  it("handles single hypothesis correctly", () => {
    const hypotheses = makeHypotheses([
      {
        description: "Solo hypothesis",
        confidence: "medium",
        evidence: ["e1"],
      },
    ]);

    render(<HypothesisList hypotheses={hypotheses} />);

    expect(screen.getByText("Solo hypothesis")).toBeDefined();
    expect(screen.getByText("medium")).toBeDefined();
  });
});
