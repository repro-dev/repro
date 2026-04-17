import { Block } from "@jsxstyle/react";
import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { FindErrorsResultView } from "./FindErrorsResultView";

const meta: Meta<typeof FindErrorsResultView> = {
  title: "Agentic/FindErrorsResultView",
  component: FindErrorsResultView,
  tags: ["experimental"],
  decorators: [
    (Story) => (
      <Block inlineSize={720} padding={8}>
        <Story />
      </Block>
    ),
  ],
};

export default meta;

export const Default: StoryObj<typeof FindErrorsResultView> = {
  args: {
    result: {
      errors: [
        {
          time: 1500,
          source: "console",
          summary:
            "Uncaught TypeError: Cannot read properties of undefined (reading 'map') while rendering SessionList after the latest filter change.",
          stack: ["app.js:42:15", "SessionList.tsx:87:21"],
        },
        {
          time: 2200,
          source: "network",
          summary:
            "GET /api/users/me → 401 Unauthorized — missing session cookie after redirect.",
        },
        {
          time: 3100,
          source: "console",
          summary:
            "Failed to load resource: net::ERR_CONNECTION_REFUSED while syncing recording metadata.",
        },
        {
          time: 4000,
          source: "network",
          summary:
            "POST /api/recordings → 500 Internal Server Error — the write path rejected the request payload.",
        },
      ],
    },
  },
};
