import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";

import { PLACEHOLDER_COPY, REPLY_PLACEHOLDER } from "../constants";
import { AgenticInputSection } from "./AgenticInputSection";

afterEach(() => {
  cleanup();
});

describe("AgenticInputSection placeholder behaviour (REP-708)", () => {
  it("renders the first cycling placeholder when conversation has not started", () => {
    render(
      <AgenticInputSection
        disabled={false}
        shouldRaise={false}
        hasConversationStarted={false}
        entries={[]}
        onFocusChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    // AgenticInput renders placeholders as text content in animated divs
    // (not as the <textarea placeholder> attribute). The first item in
    // PLACEHOLDER_COPY is shown synchronously on initial render.
    screen.getByText(PLACEHOLDER_COPY[0]!);
  });

  it("renders the static REPLY_PLACEHOLDER once conversation has started", () => {
    render(
      <AgenticInputSection
        disabled={false}
        shouldRaise={true}
        hasConversationStarted={true}
        entries={[]}
        onFocusChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    screen.getByText(REPLY_PLACEHOLDER);
  });

  it("shows REPLY_PLACEHOLDER then reverts to cycling placeholder after conversation is reset", () => {
    const { rerender } = render(
      <AgenticInputSection
        disabled={false}
        shouldRaise={true}
        hasConversationStarted={true}
        entries={[]}
        onFocusChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    screen.getByText(REPLY_PLACEHOLDER);

    // Simulate agentic.reset() clearing the conversation
    rerender(
      <AgenticInputSection
        disabled={false}
        shouldRaise={false}
        hasConversationStarted={false}
        entries={[]}
        onFocusChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    screen.getByText(PLACEHOLDER_COPY[0]!);
  });
});
