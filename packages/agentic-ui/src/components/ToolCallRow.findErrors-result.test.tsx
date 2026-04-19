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

describe("ToolCallRow findErrors result", () => {
  it("reuses the console and network row renderers", () => {
    render(
      <ToolCallRow
        toolName="findErrors"
        result={makeToolResult({
          errors: [
            {
              time: 2500,
              source: "console",
              summary: "Request failed",
              stack: ["app.ts:12"],
            },
            {
              time: 3000,
              source: "network",
              summary:
                "GET /api/users/me → 401 Unauthorized — missing session cookie after redirect.",
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle details for findErrors" }),
    );

    expect(
      document.querySelector('[id^="console-message-line-1"]'),
    ).toBeDefined();
    expect(
      document.querySelector('[id^="network-request-line-1"]'),
    ).toBeDefined();
    expect(
      document
        .querySelector(
          '[id^="console-message-line-1"], [id^="network-request-line-1"]',
        )
        ?.id.startsWith("console-message-line-1"),
    ).toBe(true);
    expect(screen.getByText("error")).toBeDefined();
    expect(screen.getByText("Request failed")).toBeDefined();
    expect(screen.getByText("401")).toBeDefined();
    expect(screen.getByText("/api/users/me")).toBeDefined();
  });
});
