import { Block } from "@jsxstyle/react";
import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { ErrorMessage } from "./ErrorMessage";

const meta: Meta<typeof ErrorMessage> = {
  title: "Agentic/ErrorMessage",
  component: ErrorMessage,
  tags: ["experimental"],
  decorators: [
    (Story) => (
      <Block inlineSize={360} padding={8}>
        <Story />
      </Block>
    ),
  ],
  args: {
    onRetry: () => {},
  },
};

export default meta;

export const Retryable: StoryObj<typeof ErrorMessage> = {
  args: {
    error: {
      message: "The agent encountered an unexpected error. Please try again.",
      retryable: true,
      attempt: 1,
    },
  },
};

export const NonRetryable: StoryObj<typeof ErrorMessage> = {
  args: {
    error: {
      message: "Maximum retry attempts reached. Please start a new session.",
      retryable: false,
      attempt: 3,
    },
  },
};
