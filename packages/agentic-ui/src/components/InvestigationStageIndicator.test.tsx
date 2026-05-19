import { cleanup, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import React from "react";

import { MessageList } from "./MessageList";
import { InvestigationStageIndicator } from "./InvestigationStageIndicator";

afterEach(() => {
  cleanup();
});

describe("InvestigationStageIndicator", () => {
  it("shows the current stage and needs-more-evidence state", () => {
    render(<InvestigationStageIndicator stage="orient" hypotheses={[]} />);

    assert.equal(screen.getByText("orient").textContent, "orient");
    assert.equal(
      screen.getByText("needs more evidence").textContent,
      "needs more evidence",
    );
  });

  it("shows ready-to-conclude when evidence is present and MessageList passes it through", () => {
    const scrollContainerRef = React.createRef<HTMLDivElement>();
    const contentContainerRef = React.createRef<HTMLDivElement>();

    render(
      <MessageList
        entries={[]}
        loading="none"
        error={null}
        onRetry={() => {}}
        scrollContainerRef={scrollContainerRef}
        contentContainerRef={contentContainerRef}
        onSelectPrompt={() => {}}
        wasCancelled={false}
        stage="conclusion"
        hypotheses={[
          {
            id: "h1",
            description: "The request is failing before render",
            evidence: ["console error at 3.2s"],
          },
        ]}
      />,
    );

    assert.equal(
      screen.getByText("ready to conclude").textContent,
      "ready to conclude",
    );
    assert.equal(screen.getByText("conclusion").textContent, "conclusion");
  });
});
