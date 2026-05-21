import {
  isTerminalState,
  type ArtifactRef,
  type ConfigEntry,
  type DomainEvent,
  type EngineStatus,
  type ItemDetail,
  type ItemSummary,
  type RunSummary,
  type TransportCorrelation,
  type WorkerSummary,
} from "@repro/autobot-core";
import type {
  FlowcraftEventRecord,
  FlowcraftExecutionRecord,
} from "@repro/autobot-store";
import type {
  FlowcraftValidationResult,
  FlowcraftWorkflowSummary,
} from "@repro/autobot-flowcraft";

import type { DiscoverData, EngineStatusData } from "../types";

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

function renderArtifacts(artifacts: ArtifactRef[]): string[] {
  if (artifacts.length === 0) {
    return [];
  }

  return [
    "Artifacts:",
    ...artifacts.map((artifact) => {
      const description =
        artifact.description === null ? "" : ` — ${artifact.description}`;
      return `  ${artifact.kind}: ${artifact.path}${description}`;
    }),
  ];
}

function renderEvents(events: DomainEvent[]): string[] {
  if (events.length === 0) {
    return [];
  }

  return ["Events:", ...events.map((event) => `  ${renderDomainEvent(event)}`)];
}

function renderHealthEntry(health: EngineStatus["health"][number]): string {
  return `${health.status.toUpperCase()} ${health.code}: ${health.message}`;
}

function renderWorkerEntry(
  worker: EngineStatus["active_workers"][number],
  title = "Worker",
): string[] {
  const lines = [
    `${title}: ${worker.worker_id}`,
    `  state: ${worker.state}`,
    `  issue_id: ${worker.issue_id ?? "n/a"}`,
    `  run_id: ${worker.run_id ?? "n/a"}`,
    `  pid: ${worker.pid ?? "n/a"}`,
    `  started_at: ${worker.started_at}`,
    `  last_heartbeat_at: ${worker.last_heartbeat_at ?? "n/a"}`,
  ];

  if (worker.child_pid != null) {
    lines.splice(5, 0, `  child_pid: ${worker.child_pid}`);
  }

  if (worker.flowcraft_execution_id != null) {
    lines.push(`  flowcraft_execution_id: ${worker.flowcraft_execution_id}`);
  }

  if (worker.workflow_node_id != null) {
    lines.push(`  workflow_node_id: ${worker.workflow_node_id}`);
  }

  if (worker.phase != null) {
    lines.push(`  phase: ${worker.phase}`);
  }

  if (worker.process_group_id != null) {
    lines.push(`  process_group_id: ${worker.process_group_id}`);
  }

  if (worker.command != null) {
    lines.push(`  command: ${worker.command}`);
  }

  if (worker.args !== undefined) {
    lines.push(`  args: ${JSON.stringify(worker.args)}`);
  }

  if (worker.deadline_at != null) {
    lines.push(`  deadline_at: ${worker.deadline_at}`);
  }

  if (worker.stdout_log_path != null) {
    lines.push(`  stdout_log_path: ${worker.stdout_log_path}`);
  }

  if (worker.stderr_log_path != null) {
    lines.push(`  stderr_log_path: ${worker.stderr_log_path}`);
  }

  if (worker.finished_at != null) {
    lines.push(`  finished_at: ${worker.finished_at}`);
  }

  if (worker.exit_code != null) {
    lines.push(`  exit_code: ${worker.exit_code}`);
  }

  if (worker.signal != null) {
    lines.push(`  signal: ${worker.signal}`);
  }

  if (worker.result_artifact_path != null) {
    lines.push(`  result_artifact_path: ${worker.result_artifact_path}`);
  }

  if (worker.result != null) {
    lines.push(`  result: ${JSON.stringify(worker.result)}`);
  }

  if (worker.transport != null) {
    lines.push(
      "  Relay:",
      `    source: ${worker.transport.source}`,
      `    workspace_id: ${worker.transport.workspace_id ?? "n/a"}`,
      `    channel_id: ${worker.transport.channel_id ?? "n/a"}`,
      `    thread_id: ${worker.transport.thread_id ?? "n/a"}`,
      `    agent_id: ${worker.transport.agent_id ?? "n/a"}`,
      `    message_id: ${worker.transport.message_id ?? "n/a"}`,
    );
  }

  return lines;
}

function renderStatusSection(
  title: string,
  input: EngineStatusData,
  options?: { color?: boolean },
): string {
  const theme = createTextTheme({ color: options?.color === true });
  const status = input.supervisor;
  const statusLabel = title.startsWith("Supervisor") ? "Supervisor" : "Engine";
  const counts = Object.entries(input.counts)
    .map(([state, count]) => `${state}: ${count}`)
    .join(", ");

  const lines = [
    theme.bold(title),
    `${theme.bold(`${statusLabel}:`)} ${status.state}`,
    `${theme.bold("PID:")} ${status.pid ?? "n/a"}`,
    `${theme.bold("Started:")} ${status.started_at ?? "n/a"}`,
    `${theme.bold("Counts:")} ${counts}`,
  ];

  if (status.last_tick_at !== null) {
    lines.push(
      `${theme.bold("Last tick:")} ${status.last_tick_at}`,
      `${theme.bold("Tick scope:")} queue scheduler`,
    );
  }

  if (input.action !== undefined) {
    lines.push(`${theme.bold("Action:")} ${input.action}`);
  }

  if (input.message !== undefined) {
    lines.push(`${theme.bold("Message:")} ${input.message}`);
  }

  if (status.health.length > 0) {
    lines.push(
      "",
      "Health:",
      indentLines(status.health.map(renderHealthEntry)),
    );
  }

  if (status.active_workers.length > 0) {
    lines.push(
      "",
      "Workers:",
      indentLines(
        status.active_workers.flatMap((worker) => renderWorkerEntry(worker)),
      ),
    );
  }

  const events = input.events ?? status.events ?? [];

  if (events.length > 0) {
    lines.push("", "Events:", indentLines(events.map(renderDomainEvent)));
  }

  if (input.tick !== undefined) {
    lines.push(
      "",
      `${theme.bold("Dry run:")} ${input.tick.dry_run ? "yes" : "no"}`,
      `${theme.bold("Reconciled:")} ${
        input.tick.reconciled_issue_ids.length > 0
          ? input.tick.reconciled_issue_ids.join(", ")
          : "none"
      }`,
      `${theme.bold("Discovered:")} ${
        input.tick.discovered_issue_ids.length > 0
          ? input.tick.discovered_issue_ids.join(", ")
          : "none"
      }`,
      `${theme.bold("Queued:")} ${
        input.tick.queued_issue_ids.length > 0
          ? input.tick.queued_issue_ids.join(", ")
          : "none"
      }`,
      `${theme.bold("Selected:")} ${
        input.tick.selected_issue_ids.length > 0
          ? input.tick.selected_issue_ids.join(", ")
          : "none"
      }`,
      `${theme.bold("Skipped:")} ${input.tick.skipped.length}`,
    );
  }

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

export function renderAutobotWarnings(
  warnings: readonly { code: string; message: string; severity: string }[],
): string {
  if (warnings.length === 0) {
    return "";
  }

  return [
    "Warnings:",
    ...warnings.map(
      (warning) =>
        `  ${warning.severity.toUpperCase()} ${warning.code}: ${
          warning.message
        }`,
    ),
  ].join("\n");
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

  if (item.current_run !== null) {
    lines.push(
      "Current run:",
      `  run_id: ${item.current_run.run_id}`,
      `  state: ${item.current_run.state}`,
      `  worker_id: ${item.current_run.worker_id ?? "n/a"}`,
      `  last_heartbeat_at: ${item.current_run.last_heartbeat_at ?? "n/a"}`,
      ...renderTransportCorrelation(item.current_run.transport),
    );
  }

  if (item.current_worker !== null && item.current_worker !== undefined) {
    lines.push(
      "Current worker:",
      indentLines(renderWorkerEntry(item.current_worker)),
    );
  }

  lines.push(...renderArtifacts(item.artifacts));

  lines.push(...renderEvents(item.events));

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
  input: EngineStatusData,
  options?: { color?: boolean },
): string {
  return renderStatusSection("Queue status", input, options);
}

export function renderAutobotEngineStatus(
  input: EngineStatusData,
  options?: { color?: boolean },
): string {
  return renderStatusSection("Engine status", input, options);
}

export function renderAutobotSupervisorStatus(
  input: EngineStatusData,
  options?: { color?: boolean },
): string {
  return renderStatusSection("Supervisor status", input, options);
}

export function renderAutobotEngineLogs(
  input: EngineStatusData,
  options?: { color?: boolean },
): string {
  return renderStatusSection("Engine logs", input, options);
}

export function renderAutobotSupervisorLogs(
  input: EngineStatusData,
  options?: { color?: boolean },
): string {
  return renderStatusSection("Supervisor logs", input, options);
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
  const scope =
    input.projects.length > 0 ? input.projects.join(", ") : "all projects";

  const lines = [
    input.candidates.length > 0
      ? `Found ${input.candidates.length} candidates for ${scope}.`
      : input.scanned === 0
      ? `No remote issues scanned for ${scope}.`
      : `Scanned ${input.scanned} remote issues for ${scope}; all excluded.`,
    `Limit: ${input.filters.limit}`,
  ];

  if (input.candidates.length > 0) {
    lines.push(`Scanned ${input.scanned} remote issues.`);
    lines.push(
      ...input.candidates.map(
        (candidate) =>
          `${candidate.issue_id} · ${candidate.title ?? "(untitled)"}`,
      ),
    );
  }

  if (input.exclusions.length > 0 && input.candidates.length > 0) {
    lines.push(
      "",
      `Exclusions: ${input.exclusions.length} (see --json for details)`,
    );
  }

  if (input.exclusions.length > 0 && input.candidates.length === 0) {
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

function renderTransportCorrelation(
  transport: TransportCorrelation | null,
): string[] {
  if (transport === null) {
    return [];
  }

  return [
    "Transport:",
    `  source: ${transport.source}`,
    `  workspace_id: ${transport.workspace_id ?? "n/a"}`,
    `  channel_id: ${transport.channel_id ?? "n/a"}`,
    `  thread_id: ${transport.thread_id ?? "n/a"}`,
    `  agent_id: ${transport.agent_id ?? "n/a"}`,
    `  message_id: ${transport.message_id ?? "n/a"}`,
  ];
}

function renderWorkflowSummary(workflow: FlowcraftWorkflowSummary): string {
  return `${workflow.id} v${workflow.version} · ${workflow.node_ids.join(
    " → ",
  )}`;
}

export function renderAutobotWorkflowList(
  workflows: FlowcraftWorkflowSummary[],
): string {
  if (workflows.length === 0) {
    return "No workflows available.";
  }

  return ["Workflow list", ...workflows.map(renderWorkflowSummary)].join(
    String.fromCharCode(10),
  );
}

export function renderAutobotWorkflowValidation(
  validations: FlowcraftValidationResult[],
): string {
  if (validations.length === 0) {
    return "No workflows available.";
  }

  const lines = ["Workflow validation"];

  for (const validation of validations) {
    lines.push(
      `${validation.workflow_id}: ${validation.valid ? "valid" : "invalid"}`,
    );

    for (const issue of validation.issues) {
      lines.push(`  - ${issue.code}: ${issue.message}`);
    }
  }

  return lines.join(String.fromCharCode(10));
}

export function renderAutobotWorkflowDiagram(diagram: string): string {
  return diagram;
}

function renderDomainEvent(event: DomainEvent): string {
  const transport =
    event.transport === null
      ? ""
      : ` transport=${JSON.stringify(event.transport)}`;
  return `${event.occurred_at} ${event.type} ${event.message}${transport}`;
}

function renderFlowcraftEvent(event: FlowcraftEventRecord): string {
  return `${event.occurred_at} ${event.node_id} ${event.type} ${JSON.stringify(
    event.data,
  )}`;
}

function renderExecutionSummary(
  execution: FlowcraftExecutionRecord | null,
): string[] {
  if (execution === null) {
    return ["Execution: n/a"];
  }

  const lines = [
    `Execution: ${execution.execution_id}`,
    `Workflow state: ${execution.state}`,
    `Started: ${execution.started_at}`,
  ];

  if (execution.finished_at !== null) {
    lines.push(`Finished: ${execution.finished_at}`);
  }

  if (Object.keys(execution.metadata).length > 0) {
    lines.push(`Metadata: ${JSON.stringify(execution.metadata)}`);
  }

  return lines;
}

export function renderAutobotFlowcraftInspect(input: {
  lookup: {
    kind: "run" | "flowcraft-execution";
    identifier: string;
    issue_id: string | null;
    run: RunSummary | null;
    worker: WorkerSummary | null;
    execution: FlowcraftExecutionRecord | null;
    artifacts: ArtifactRef[];
    domain_events: DomainEvent[];
    flowcraft_events: FlowcraftEventRecord[];
  };
}): string {
  const lines = [
    `Inspect: ${input.lookup.identifier}`,
    `Lookup: ${input.lookup.kind}`,
    `Issue: ${input.lookup.issue_id ?? "n/a"}`,
    ...renderExecutionSummary(input.lookup.execution),
    ...(input.lookup.worker === null
      ? []
      : [
          "Lookup worker:",
          indentLines(renderWorkerEntry(input.lookup.worker)),
        ]),
    ...renderTransportCorrelation(input.lookup.run?.transport ?? null),
    ...renderArtifacts(input.lookup.artifacts),
  ];

  if (input.lookup.domain_events.length > 0) {
    lines.push("", "Domain events:");
    lines.push(
      ...input.lookup.domain_events.map(
        (event) => `  ${renderDomainEvent(event)}`,
      ),
    );
  }

  if (input.lookup.flowcraft_events.length > 0) {
    lines.push("", "FlowCraft events:");
    lines.push(
      ...input.lookup.flowcraft_events.map(
        (event) => `  ${renderFlowcraftEvent(event)}`,
      ),
    );
  }

  return lines.join(String.fromCharCode(10));
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
