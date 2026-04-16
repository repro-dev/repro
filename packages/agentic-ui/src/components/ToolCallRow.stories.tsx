import { Block } from "@jsxstyle/react";
import { ToolMessage } from "@repro/agentic";
import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { ToolCallRow } from "./ToolCallRow";

const meta: Meta<typeof ToolCallRow> = {
  title: "Agentic/ToolCallRow",
  component: ToolCallRow,
  tags: ["experimental"],
  decorators: [
    (Story) => (
      <Block inlineSize={360} padding={8}>
        <Story />
      </Block>
    ),
  ],
};

export default meta;

function makeResult(content: object): ToolMessage {
  return {
    id: "r1",
    timestamp: new Date(),
    role: "tool",
    content: JSON.stringify(content),
    tool_call_id: "tc1",
  };
}

export const Success: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: "getRecordingDuration",
    result: makeResult({ durationMs: 12500 }),
    isExecuting: false,
  },
};

export const Executing: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: "getNetworkRequests",
    result: null,
    isExecuting: true,
  },
};

export const ErrorResult: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: "getDOMState",
    result: makeResult({ error: "Recording not found", code: "NOT_FOUND" }),
    isExecuting: false,
  },
};

export const UnknownToolName: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: "someFutureTool",
    result: makeResult({ items: [] }),
    isExecuting: false,
  },
};

export const AllToolLabels: StoryObj = {
  render: () => (
    <Block>
      {[
        "getRecordingDuration",
        "getConsoleMessages",
        "getNetworkRequests",
        "getDOMState",
        "findErrors",
        "getElementDetails",
        "getEvents",
        "getEventsAroundTime",
        "captureScreenshot",
        "getDOMDiff",
      ].map((name) => (
        <ToolCallRow
          key={name}
          toolName={name}
          result={makeResult({ ok: true })}
          isExecuting={false}
        />
      ))}
    </Block>
  ),
};

// --- Semantic result view stories ---

export const ConsoleMessages: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: "getConsoleMessages",
    isExecuting: false,
    result: makeResult({
      messages: [
        { timeMs: 1500, level: "info", text: "App initialised", count: 1 },
        {
          timeMs: 2100,
          level: "warning",
          text: "Deprecated API used: window.webkitStorageInfo",
          count: 1,
        },
        {
          timeMs: 3400,
          level: "error",
          text: "Uncaught TypeError: Cannot read properties of undefined (reading 'map')",
          count: 2,
          stack: ["app.js:42:15", "runtime.js:1:45"],
        },
        { timeMs: 4000, level: "log", text: "User clicked submit", count: 1 },
      ],
      summary: { verbose: 0, info: 1, warning: 1, error: 2 },
    }),
  },
};

export const NetworkRequests: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: "getNetworkRequests",
    isExecuting: false,
    result: makeResult({
      requests: [
        {
          timeMs: 500,
          type: "fetch",
          method: "GET",
          url: "/api/sessions",
          status: 200,
          durationMs: 42,
        },
        {
          timeMs: 800,
          type: "fetch",
          method: "POST",
          url: "/api/recordings",
          status: 201,
          durationMs: 110,
        },
        {
          timeMs: 1200,
          type: "fetch",
          method: "GET",
          url: "/api/users/me",
          status: 401,
          durationMs: 25,
        },
        {
          timeMs: 1800,
          type: "fetch",
          method: "DELETE",
          url: "/api/recordings/abc123",
          status: 500,
          durationMs: 300,
        },
        { timeMs: 2500, type: "ws", url: "/ws/events" },
      ],
      summary: {
        total: 5,
        succeeded: 2,
        failed: 2,
        byMethod: { GET: 2, POST: 1, DELETE: 1 },
      },
    }),
  },
};

export const FindErrors: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: "findErrors",
    isExecuting: false,
    result: makeResult({
      errors: [
        {
          time: 1500,
          source: "console",
          summary:
            "Uncaught TypeError: Cannot read properties of undefined (reading 'map')",
          stack: ["app.js:42:15"],
        },
        { time: 2200, source: "network", summary: "GET /api/users/me → 401" },
        {
          time: 3100,
          source: "console",
          summary: "Failed to load resource: net::ERR_CONNECTION_REFUSED",
        },
        {
          time: 4000,
          source: "network",
          summary: "POST /api/recordings → 500",
        },
      ],
      summary: { console: 2, network: 2, total: 4 },
    }),
  },
};

export const JsonFallback: StoryObj<typeof ToolCallRow> = {
  args: {
    toolName: "getElementDetails",
    isExecuting: false,
    result: makeResult({
      tagName: "button",
      attributes: {
        id: "submit-btn",
        class: "btn btn-primary",
        disabled: "true",
      },
      boundingBox: { x: 120, y: 340, width: 96, height: 32 },
      textContent: "Submit",
    }),
  },
};
