import { Block } from "@jsxstyle/react";
import { atom } from "@repro/atom";
import { AgenticError, AgenticState, Entry, Loading } from "@repro/agentic";
import { Card } from "@repro/design";
import type { Decorator, Meta, StoryObj } from "@storybook/react";
import React from "react";
import { AgenticView } from "./AgenticView";
import { AgenticStateContext } from "./context";

const meta: Meta = {
  title: "Agentic/AgenticView",
  component: AgenticView,
  tags: ["experimental"],
  decorators: [
    (Story) => (
      <Block
        blockSize={640}
        inlineSize={420}
        overflow="clip"
        overflowClipMargin={16}
      >
        <Card height="100%">
          <Story />
        </Card>
      </Block>
    ),
  ],
};

export default meta;

function withState(state: AgenticState): Decorator {
  return (Story) => (
    <AgenticStateContext.Provider value={state}>
      <Story />
    </AgenticStateContext.Provider>
  );
}

function makeState(
  entries: Array<Entry>,
  loading: Loading,
  error: AgenticError | null = null,
): AgenticState {
  return {
    $entries: atom<Array<Entry>>(entries),
    $loading: atom<Loading>(loading),
    $error: atom<AgenticError | null>(error),
    cancel: () => {},
    destroy: () => {},
    query: () => {},
  };
}

export const Default: StoryObj = {};

export const Reasoning: StoryObj = {
  decorators: [
    withState(
      makeState(
        [
          {
            id: "1",
            timestamp: new Date(),
            role: "user",
            content:
              "What is the meaning of life, the universe and everything?",
          },
          {
            id: "2",
            timestamp: new Date(),
            role: "assistant",
            content:
              "The answer to the meaning of life, the universe and everything is widely agreed to be the number **42**.",
            toolCalls: [],
          },
          {
            id: "3",
            timestamp: new Date(),
            role: "user",
            content:
              "What is the origin of this? This is a particularly long question that wraps on to multiple lines.\n\nIt also contains line breaks and **formatted** _text_.",
          },
          {
            id: "4",
            timestamp: new Date(),
            role: "assistant",
            content: "",
            toolCalls: [],
          },
        ],
        "reasoning",
      ),
    ),
  ],
};

export const Responding: StoryObj = {
  decorators: [
    withState(
      makeState(
        [
          {
            id: "1",
            timestamp: new Date(),
            role: "user",
            content:
              "What is the meaning of life, the universe and everything?",
          },
          {
            id: "2",
            timestamp: new Date(),
            role: "assistant",
            content:
              "The answer to the meaning of life, the universe and everything is widely agreed to be the number **42**.",
            toolCalls: [],
          },
          {
            id: "3",
            timestamp: new Date(),
            role: "user",
            content:
              "What is the origin of this? This is a particularly long question that wraps on to multiple lines.\n\nIt also contains line breaks and **formatted** _text_.",
          },
          {
            id: "4",
            timestamp: new Date(),
            role: "assistant",
            content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras elementum pharetra odio ut interdum. Curabitur quis nunc vulputate, ornare eros ac, rhoncus libero. Phasellus eget mi ut mi volutpat dapibus nec id lacus. Curabitur volutpat dui libero, sed rhoncus dolor ullamcorper non. Pellentesque vehicula tincidunt lorem eu viverra. Vivamus ac massa orci. Suspendisse nisl leo, vestibulum et venenatis vitae, sodales sit amet arcu. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Interdum et malesuada fames ac ante ipsum primis in faucibus. Suspendisse pretium rhoncus velit. Maecenas ullamcorper ex ultricies urna ultricies ultrices. Sed viverra sem id massa aliquam laoreet. Etiam sed maximus lectus, sit amet suscipit urna. Ut feugiat et dui ac vulputate. Donec imperdiet non ante in finibus. Cras rhoncus ullamcorper dolor, ut consectetur dolor.

Integer tempus, risus sed commodo tincidunt, urna tortor scelerisque enim, vel mattis lectus sapien ac elit. Sed condimentum ultricies rhoncus. Integer condimentum ut metus quis sodales. Integer est lorem, eleifend sodales metus eu, rhoncus volutpat ex. Donec sed feugiat nisi. Etiam quis lectus in felis congue accumsan vitae ut nulla. Praesent scelerisque neque quis leo malesuada congue. Cras malesuada, ante a bibendum accumsan, tellus metus tristique risus, venenatis iaculis dolor nunc in elit. Proin vel augue laoreet urna faucibus semper eget vel orci. In aliquet ut nisi ut venenatis. Sed at euismod dui. Integer fermentum placerat viverra. Suspendisse varius dolor at nisi fermentum tempus. Vivamus vitae tortor dictum, convallis nunc ac, auctor est.

Sed vitae orci vulputate eros maximus scelerisque. Fusce id nisi odio. Proin sollicitudin luctus elit, a condimentum eros accumsan sodales. Vestibulum vitae neque diam. Morbi fermentum id felis vel luctus. Integer nibh orci, commodo sit amet porta auctor, consequat vulputate felis. Quisque a dui augue. Fusce ac consequat est, a maximus massa.`,
            toolCalls: [],
          },
        ],
        "responding",
      ),
    ),
  ],
};

export const WithToolCalls: StoryObj = {
  decorators: [
    withState(
      makeState(
        [
          {
            id: "1",
            timestamp: new Date(),
            role: "user",
            content:
              "How long is the recording and are there any console errors?",
          },
          {
            id: "2",
            timestamp: new Date(),
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "tc1",
                index: 0,
                function: { name: "getRecordingDuration", arguments: "{}" },
              },
              {
                id: "tc2",
                index: 1,
                function: { name: "getConsoleMessages", arguments: "{}" },
              },
            ],
          },
          {
            id: "3",
            timestamp: new Date(),
            role: "tool",
            content: JSON.stringify({ duration: 12.5 }),
            tool_call_id: "tc1",
          },
          {
            id: "4",
            timestamp: new Date(),
            role: "tool",
            content: JSON.stringify({
              messages: [
                {
                  level: "error",
                  text: "Uncaught TypeError: Cannot read property",
                },
                { level: "warn", text: "Deprecated API usage" },
                { level: "error", text: "Network request failed" },
              ],
            }),
            tool_call_id: "tc2",
          },
          {
            id: "5",
            timestamp: new Date(),
            role: "assistant",
            content:
              "The recording is **12.5 seconds** long. I found **3 console messages** including 2 errors: a `TypeError` and a failed network request.",
            toolCalls: [],
          },
        ],
        "none",
      ),
    ),
  ],
};

export const ToolExecuting: StoryObj = {
  decorators: [
    withState(
      makeState(
        [
          {
            id: "1",
            timestamp: new Date(),
            role: "user",
            content: "What network requests were made during the session?",
          },
          {
            id: "2",
            timestamp: new Date(),
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "tc1",
                index: 0,
                function: { name: "getNetworkRequests", arguments: "{}" },
              },
            ],
          },
        ],
        "tool-executing",
      ),
    ),
  ],
};

export const WithError: StoryObj = {
  decorators: [
    withState(
      makeState(
        [
          {
            id: "1",
            timestamp: new Date(),
            role: "user",
            content: "What is causing this bug?",
          },
        ],
        "none",
        {
          message:
            "The agent encountered an unexpected error. Please try again.",
          retryable: true,
          attempt: 1,
        },
      ),
    ),
  ],
};
