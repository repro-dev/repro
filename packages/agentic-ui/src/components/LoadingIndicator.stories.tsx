import { Block } from "@jsxstyle/react";
import { Loading } from "@repro/agentic";
import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { LoadingIndicator } from "./LoadingIndicator";

const meta: Meta<typeof LoadingIndicator> = {
  title: "Agentic/LoadingIndicator",
  component: LoadingIndicator,
  tags: ["experimental"],
  decorators: [
    (Story) => (
      // The pill uses position:absolute with bottom:0, so wrap in a
      // relative container tall enough to show it.
      <Block position="relative" height={80}>
        <Story />
      </Block>
    ),
  ],
};

export default meta;

// Pill is translated off-screen — nothing visible in this state.
export const Hidden: StoryObj<typeof LoadingIndicator> = {
  args: {
    loading: "none" as Loading,
  },
};

// Blue pill with animated dots and "Thinking…" label, cancel button shown.
export const Reasoning: StoryObj<typeof LoadingIndicator> = {
  args: {
    loading: "reasoning" as Loading,
    onCancel: () => {},
  },
};

// Blue pill with animated dots and "Responding…" label, cancel button shown.
export const Responding: StoryObj<typeof LoadingIndicator> = {
  args: {
    loading: "responding" as Loading,
    onCancel: () => {},
  },
};

// Blue pill with animated dots and "Analysing…" label, cancel button shown.
export const ToolExecuting: StoryObj<typeof LoadingIndicator> = {
  args: {
    loading: "tool-executing" as Loading,
    onCancel: () => {},
  },
};

// Grey pill with "Cancelled" label — no dots, no cancel button.
export const Cancelled: StoryObj<typeof LoadingIndicator> = {
  args: {
    loading: "cancelled" as Loading,
  },
};

// Blue pill with dots and label, but no cancel button (onCancel omitted).
export const ReasoningNoCancel: StoryObj<typeof LoadingIndicator> = {
  args: {
    loading: "reasoning" as Loading,
  },
};
