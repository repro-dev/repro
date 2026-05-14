import type { ErrorPayload } from "@repro/autobot-core";

import { createTextTheme, indentLines } from "./text";
import type { AutobotRenderedStatus } from "../types";

function headline(status: AutobotRenderedStatus): string {
  return `${status.issue_id} · ${status.title ?? "Untitled"}`;
}

function renderNextLines(
  status: AutobotRenderedStatus,
  fallback: string,
): string[] {
  return status.recovery_commands.length > 0
    ? ["Next:", ...status.recovery_commands]
    : ["Next:", fallback];
}

function renderStatusBlock(
  status: AutobotRenderedStatus,
  options?: { color?: boolean; includeMetadata?: boolean },
): string {
  const theme = createTextTheme({ color: options?.color === true });
  const lines = [
    theme.bold(headline(status)),
    `${theme.cyan("State:")} ${status.state}`,
  ];

  if (options?.includeMetadata !== false) {
    if (status.priority !== null) {
      lines.push(`${theme.cyan("Priority:")} ${status.priority}`);
    }
    if (status.owner !== null) {
      lines.push(`${theme.cyan("Owner:")} ${status.owner}`);
    }
    if (status.workspace !== null) {
      lines.push(`${theme.cyan("Workspace:")} ${status.workspace}`);
    }
    if (status.branch !== null) {
      lines.push(`${theme.cyan("Branch:")} ${status.branch}`);
    }
  }

  if (options?.includeMetadata !== false && status.last_event !== null) {
    lines.push(`${theme.cyan("Last event:")} ${status.last_event}`);
  }

  if (options?.includeMetadata !== false && status.last_error !== null) {
    lines.push(
      `${theme.red("Last error:")} ${status.last_error.code} — ${
        status.last_error.message
      }`,
    );
  }

  if (status.state === "failed") {
    lines.push(
      ...renderNextLines(
        status,
        `Check the last error and re-run autobot-next status ${status.issue_id} --json.`,
      ),
    );
  } else if (status.state === "awaiting") {
    lines.push(
      ...renderNextLines(
        status,
        `Check the current engine state and re-run autobot-next status ${status.issue_id} --json.`,
      ),
    );
  }

  return lines.join("\n");
}

export function renderAutobotItemDetail(
  status: AutobotRenderedStatus,
  options?: { color?: boolean },
): string {
  return renderStatusBlock(status, { ...options, includeMetadata: true });
}

export function renderAutobotStatusSummary(
  status: AutobotRenderedStatus,
  options?: { color?: boolean },
): string {
  return renderStatusBlock(status, { ...options, includeMetadata: false });
}

export function renderAutobotError(
  error: ErrorPayload,
  options?: { color?: boolean },
): string {
  const theme = createTextTheme({ color: options?.color === true });
  const lines = [
    theme.bold("Autobot CLI error"),
    `${theme.red("What failed:")} ${error.what_failed}`,
    `${theme.red("Likely cause:")} ${error.likely_cause}`,
    `${theme.red("Message:")} ${error.message}`,
    "Next:",
    ...error.recovery_commands,
  ];

  if (error.details !== null) {
    lines.push("", indentLines([JSON.stringify(error.details, null, 2)]));
  }

  return lines.join("\n");
}
