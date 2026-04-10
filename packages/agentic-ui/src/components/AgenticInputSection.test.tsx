import { cleanup, render } from "@testing-library/react";
import expect from "expect";
import { afterEach, describe, it, mock } from "node:test";
import React from "react";

// Capture the last placeholders prop passed to AgenticInput.
// Must be registered before importing AgenticInputSection (which imports @repro/design).
let capturedPlaceholders: Array<string> | undefined;

mock.module("@repro/design", {
  namedExports: {
    AgenticInput: (props: {
      disabled?: boolean;
      placeholders?: Array<string>;
      historyValue?: string;
      onFocusChange: (hasFocus: boolean) => void;
      onNavigateHistory?: (direction: "up" | "down") => void;
      onSubmit: () => void;
    }) => {
      capturedPlaceholders = props.placeholders;
      return null;
    },
    AgenticInputFormState: {},
    colors: { white: "#fff", slate: { "100": "#f1f5f9", "200": "#e2e8f0" } },
    spacing: { "2xl": 24 },
  },
});

// Import after mock registration so the mock takes effect
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AgenticInputSection } =
  require("./AgenticInputSection") as typeof import("./AgenticInputSection");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PLACEHOLDER_COPY, REPLY_PLACEHOLDER } =
  require("../constants") as typeof import("../constants");

afterEach(() => {
  capturedPlaceholders = undefined;
  cleanup();
});

describe("AgenticInputSection placeholder behaviour (REP-708)", () => {
  it("passes cycling PLACEHOLDER_COPY when conversation has not started", () => {
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

    expect(capturedPlaceholders).toEqual(PLACEHOLDER_COPY);
  });

  it("passes a single static REPLY_PLACEHOLDER once conversation has started", () => {
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

    expect(capturedPlaceholders).toEqual([REPLY_PLACEHOLDER]);
  });

  it("reverts to cycling PLACEHOLDER_COPY after conversation is reset", () => {
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

    expect(capturedPlaceholders).toEqual([REPLY_PLACEHOLDER]);

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

    expect(capturedPlaceholders).toEqual(PLACEHOLDER_COPY);
  });
});
