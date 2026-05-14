import {
  isTerminalState,
  type ConfigEntry,
  type EngineStatus,
  type ItemDetail,
  type ItemSummary,
  type ItemState,
} from "@repro/autobot-core";

import type { DiscoverData } from "../types";

import { createTextTheme, indentLines } from "./text";

function headline(item: ItemSummary): string {
  return `${item.issue_id} · ${item.title ?? "(untitled)"}`;
}

function renderCommonFields(item: ItemSummary, color: boolean): string[] {
  const theme = createTextTheme({ color });

  return [
    `${theme.bold("State:")} ${item.state}`,
    `${theme.bold("Priority:")} ${item.priority ?? "n/a"}`,
    `${theme.bold("Owner:")} ${item.owner ?? "n/a"}`,
    `${theme.bold("Workspace:")} ${item.workspace ?? "n/a"}`,
    `${theme.bold("Branch:")} ${item.branch ?? "n/a"}`,
  ];
}

function renderNext(item: ItemDetail): string[] {
  if (isTerminalState(item.state)) {
    return [];
  }

  const next =
    item.recovery_commands.length > 0
      ? item.recovery_commands
      : [`autobot-next status ${item.issue_id} --json`];
  return ["Next:", ...next];
}

function renderConfigValue(value: string | number | boolean): string {
  return value === "" ? "(unset)" : String(value);
}

function renderConfigEntry(entry: ConfigEntry): string[] {
  return [
    `${entry.key}: ${renderConfigValue(entry.value)}`,
    `  source: ${entry.source}`,
    `  default: ${renderConfigValue(entry.default_value)}`,
    `  description: ${entry.description}`,
  ];
}

export function renderAutobotItemSummary(
  item: ItemSummary,
  options?: { color?: boolean },
): string {
  const theme = createTextTheme({ color: options?.color === true });
  return [headline(item), ...renderCommonFields(item, options?.color === true)]
    .map((line, index) => (index === 0 ? theme.bold(line) : line))
    .join("\n");
}

export function renderAutobotItemDetail(
  item: ItemDetail,
  options?: { color?: boolean },
): string {
  const lines = [
    headline(item),
    ...renderCommonFields(item, options?.color === true),
  ];

  if (item.last_event !== null) {
    lines.push(`Last event: ${item.last_event}`);
  }

  if (item.last_error !== null) {
    lines.push(
      `Last error: ${item.last_error.code} — ${item.last_error.message}`,
    );
  }

  lines.push(...renderNext(item));
  return lines.join("\n");
}

export function renderAutobotQueueList(
  items: ItemSummary[],
  options?: { color?: boolean },
): string {
  if (items.length === 0) {
    return "No queued items found.";
  }

  return items
    .map((item) => renderAutobotItemSummary(item, options))
    .join("\n\n");
}

export function renderAutobotQueueMutation(
  input: {
    action: "add" | "remove";
    changed: boolean;
    dry_run: boolean;
    item: ItemSummary;
    events: Array<{ type: string }>;
  },
  options?: { color?: boolean },
): string {
  const title = input.action === "add" ? "Queued item" : "Removed item";
  const lines = [
    `${title}: ${headline(input.item)}`,
    ...renderCommonFields(input.item, options?.color === true),
    `Changed: ${input.changed ? "yes" : "no"}`,
    `Dry run: ${input.dry_run ? "yes" : "no"}`,
    `Events: ${input.events.length}`,
  ];

  return lines.join("\n");
}

export function renderAutobotQueueStatus(
  input: {
    engine: EngineStatus;
    counts: Record<ItemState, number>;
    items: ItemSummary[];
    config: ConfigEntry[];
  },
  options?: { color?: boolean },
): string {
  const theme = createTextTheme({ color: options?.color === true });
  const counts = Object.entries(input.counts)
    .map(([state, count]) => `${state}: ${count}`)
    .join(", ");

  const lines = [
    theme.bold("Queue status"),
    `${theme.bold("Engine:")} ${input.engine.state}`,
    `${theme.bold("Counts:")} ${counts}`,
  ];

  if (input.items.length > 0) {
    lines.push(
      "",
      "Items:",
      indentLines(
        input.items.map((item) => renderAutobotItemSummary(item, options)),
      ),
    );
  }

  if (input.config.length > 0) {
    lines.push(
      "",
      "Config:",
      indentLines(input.config.flatMap(renderConfigEntry)),
    );
  }

  return lines.join("\n");
}

export function renderAutobotConfigList(config: ConfigEntry[]): string {
  if (config.length === 0) {
    return "No config keys available.";
  }

  return config.flatMap(renderConfigEntry).join("\n");
}

export function renderAutobotConfigValue(entry: ConfigEntry): string {
  return renderConfigEntry(entry).join("\n");
}

export function renderAutobotConfigMutation(input: {
  action: "set" | "unset";
  changed: boolean;
  dry_run: boolean;
  previous: ConfigEntry;
  next: ConfigEntry;
  events: Array<{ type: string }>;
}): string {
  const lines = [
    `Config ${input.action}: ${input.next.key}`,
    `Changed: ${input.changed ? "yes" : "no"}`,
    `Dry run: ${input.dry_run ? "yes" : "no"}`,
    `Previous: ${renderConfigValue(input.previous.value)}`,
    `Next: ${renderConfigValue(input.next.value)}`,
    `Events: ${input.events.length}`,
  ];

  return lines.join("\n");
}

export function renderAutobotDiscoverResults(input: DiscoverData): string {
  if (input.candidates.length === 0) {
    return `No discovery candidates found for ${input.project}.`;
  }

  const lines = [
    `Discover results for ${input.project}`,
    `Candidates: ${input.candidates.length}`,
    ...input.candidates.map(
      (candidate) =>
        `${candidate.issue_id} · ${candidate.title ?? "(untitled)"}`,
    ),
  ];

  if (input.exclusions.length > 0) {
    lines.push(
      "",
      `Exclusions: ${input.exclusions.length}`,
      ...input.exclusions.map((entry) => {
        const suffix =
          entry.details === null ? "" : ` ${JSON.stringify(entry.details)}`;
        return `${entry.issue_id} (${entry.reason})${suffix}`;
      }),
    );
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
