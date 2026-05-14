import type { ItemDetail, ItemSummary } from "@repro/autobot-core";

import { createTextTheme, indentLines } from "./text";

function headline(item: ItemSummary): string {
  return `${item.issue_id} · ${item.title ?? "Untitled"}`;
}

function renderCommonFields(item: ItemSummary, color: boolean): string[] {
  const theme = createTextTheme({ color });
  const lines = [
    theme.bold(headline(item)),
    `${theme.cyan("State:")} ${item.state}`,
  ];

  if (item.priority !== null) {
    lines.push(`${theme.cyan("Priority:")} ${item.priority}`);
  }
  if (item.owner !== null) {
    lines.push(`${theme.cyan("Owner:")} ${item.owner}`);
  }
  if (item.workspace !== null) {
    lines.push(`${theme.cyan("Workspace:")} ${item.workspace}`);
  }
  if (item.branch !== null) {
    lines.push(`${theme.cyan("Branch:")} ${item.branch}`);
  }

  return lines;
}

function renderNext(item: ItemDetail): string[] {
  const fallback = `Check the current state and re-run autobot-next status ${item.issue_id} --json.`;

  return item.recovery_commands.length > 0
    ? ["Next:", ...item.recovery_commands]
    : ["Next:", fallback];
}

export function renderAutobotItemSummary(
  item: ItemSummary,
  options?: { color?: boolean },
): string {
  return renderCommonFields(item, options?.color === true).join("\n");
}

export function renderAutobotItemDetail(
  item: ItemDetail,
  options?: { color?: boolean },
): string {
  const color = options?.color === true;
  const theme = createTextTheme({ color });
  const lines = renderCommonFields(item, color);

  if (item.last_event !== null) {
    lines.push(`${theme.cyan("Last event:")} ${item.last_event}`);
  }

  if (item.last_error !== null) {
    lines.push(
      `${theme.red("Last error:")} ${item.last_error.code} — ${
        item.last_error.message
      }`,
    );
  }

  if (item.state === "failed" || item.state === "awaiting") {
    lines.push(...renderNext(item));
  }

  return lines.join("\n");
}

export function renderAutobotError(
  error: {
    what_failed: string;
    likely_cause: string;
    message: string;
    recovery_commands: string[];
    details: Record<string, unknown> | null;
  },
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
