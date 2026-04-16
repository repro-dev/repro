import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import expect from "expect";
import { afterEach, describe, it } from "node:test";
import React from "react";
import type { ToolMessage } from "@repro/agentic";

import { ToolCallRow } from "./ToolCallRow";

function makeToolResult(content: Record<string, unknown>): ToolMessage {
  return { content: JSON.stringify(content) } as unknown as ToolMessage;
}

afterEach(() => {
  cleanup();
});

describe("ToolCallRow semantic result hints", () => {
  it("preserves _hint for empty getConsoleMessages results", () => {
    render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [],
          _hint: "Try removing the logLevel filter to see all messages.",
        })}
        isExecuting={false}
        wasCancelled={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Toggle details for getConsoleMessages",
      }),
    );

    expect(screen.getByText("No console messages")).toBeDefined();
    expect(
      screen.getByText(
        "Hint: Try removing the logLevel filter to see all messages.",
      ),
    ).toBeDefined();
  });

  it("preserves _hint for empty getNetworkRequests results", () => {
    render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [],
          _hint: "Broaden the status filter to include matching requests.",
        })}
        isExecuting={false}
        wasCancelled={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Toggle details for getNetworkRequests",
      }),
    );

    expect(screen.getByText("No network requests")).toBeDefined();
    expect(
      screen.getByText(
        "Hint: Broaden the status filter to include matching requests.",
      ),
    ).toBeDefined();
  });
});
