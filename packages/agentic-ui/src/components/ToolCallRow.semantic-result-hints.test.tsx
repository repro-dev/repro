import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

  it("renders console messages without a level badge", () => {
    const { container } = render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [
            {
              timeMs: 1500,
              level: "warning",
              text: "Retrying request",
              stack: ["app.ts:12"],
            },
          ],
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

    expect(screen.getByText("Retrying request")).toBeDefined();
    expect(screen.getByText("app.ts:12")).toBeDefined();
    expect(screen.queryByText("warning")).toBeNull();

    const icon = container.querySelector("svg");
    const messageRow =
      screen.getByText("Retrying request").parentElement?.parentElement;

    expect(icon?.parentElement).not.toBeNull();
    expect(messageRow).not.toBeNull();

    const iconWrapperStyle = window.getComputedStyle(icon!.parentElement!);
    const messageRowStyle = window.getComputedStyle(messageRow!);

    expect(iconWrapperStyle.paddingTop).toBe("");
    expect(messageRowStyle.alignItems).toBe("center");
  });

  it("jumps to the console message time when requested", () => {
    let jumpedTo: number | null = null;

    render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [{ timeMs: 1500, level: "info", text: "App initialised" }],
        })}
        isExecuting={false}
        wasCancelled={false}
        onGoToTime={(timeMs) => {
          jumpedTo = timeMs;
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Toggle details for getConsoleMessages",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /go to time/i,
      }),
    );

    expect(jumpedTo).toBe(1500);
  });

  it("renders the network time action without a callback", () => {
    render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [
            {
              timeMs: 800,
              type: "fetch",
              method: "GET",
              url: "/api/health",
              status: 200,
              durationMs: 10,
            },
          ],
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

    expect(
      screen.getByRole("button", {
        name: /go to time/i,
      }),
    ).toBeDefined();
  });

  it("places the network seek action using the console offset", () => {
    const consoleRender = render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [{ timeMs: 800, level: "info", text: "Console message" }],
        })}
        isExecuting={false}
        wasCancelled={false}
      />,
    );

    fireEvent.click(
      within(consoleRender.container).getByRole("button", {
        name: "Toggle details for getConsoleMessages",
      }),
    );

    const consoleAction = within(consoleRender.container).getByRole("button", {
      name: /go to time/i,
    });
    const consoleActionWrapper = consoleAction.parentElement;

    const networkRender = render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [
            {
              timeMs: 800,
              type: "fetch",
              method: "GET",
              url: "/api/health",
              status: 200,
              durationMs: 10,
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />,
    );

    fireEvent.click(
      within(networkRender.container).getByRole("button", {
        name: "Toggle details for getNetworkRequests",
      }),
    );

    const networkAction = within(networkRender.container).getByRole("button", {
      name: /go to time/i,
    });
    const networkActionWrapper = networkAction.parentElement;

    expect(consoleActionWrapper).not.toBeNull();
    expect(networkActionWrapper).not.toBeNull();

    const consoleStyle = window.getComputedStyle(consoleActionWrapper!);
    const networkStyle = window.getComputedStyle(networkActionWrapper!);

    expect(consoleStyle.top).toBe(networkStyle.top);
    expect(consoleStyle.left).toBe(networkStyle.left);
    expect(networkStyle.top).toBe("-3px");
    expect(networkStyle.left).toBe("-10px");
  });

  it("renders the network verb as plain text", () => {
    render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [
            {
              timeMs: 800,
              type: "fetch",
              method: "GET",
              url: "/api/health",
              status: 200,
              durationMs: 10,
            },
          ],
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

    expect(screen.getByText("GET")).toBeDefined();
    expect(screen.getByText("/api/health")).toBeDefined();
    expect(screen.getByText("10ms")).toBeDefined();
  });
});
