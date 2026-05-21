export type IsoTimestamp = string;

export type ItemState =
  | "queued"
  | "claimed"
  | "preparing"
  | "planning"
  | "developing"
  | "testing"
  | "reviewing"
  | "reconciling"
  | "awaiting"
  | "failed"
  | "escalated"
  | "completed"
  | "canceled";

export const itemStates: readonly ItemState[] = [
  "queued",
  "claimed",
  "preparing",
  "planning",
  "developing",
  "testing",
  "reviewing",
  "reconciling",
  "awaiting",
  "failed",
  "escalated",
  "completed",
  "canceled",
] as const;

export const nonTerminalItemStates: readonly ItemState[] = [
  "queued",
  "claimed",
  "preparing",
  "planning",
  "developing",
  "testing",
  "reviewing",
  "reconciling",
  "awaiting",
  "failed",
] as const;

export const terminalItemStates: readonly ItemState[] = [
  "escalated",
  "completed",
  "canceled",
] as const;

export type Severity = "info" | "warning" | "error";

export type ConfigValue = string | number | boolean;
export type ConfigSource =
  | "default"
  | "profile"
  | "repo"
  | "environment"
  | "flag";

export interface RepoRef {
  path: string;
  state_dir: string;
}

export interface Warning {
  code: string;
  message: string;
  severity: Exclude<Severity, "error">;
}

export interface ErrorPayload {
  code: string;
  message: string;
  what_failed: string;
  likely_cause: string;
  recovery_commands: string[];
  details: Record<string, unknown> | null;
}

export interface ErrorSummary {
  code: string;
  message: string;
  occurred_at: IsoTimestamp;
}

export type ArtifactKind =
  | "context"
  | "test-plan"
  | "prompt"
  | "contract"
  | "run-plan"
  | "classify"
  | "risk-assessment"
  | "log"
  | "diff"
  | "review"
  | "summary"
  | "flowcraft-history"
  | "other";

export interface ArtifactRef {
  kind: ArtifactKind;
  path: string;
  description: string | null;
  created_at: IsoTimestamp;
}

export interface TransportCorrelation {
  source: string;
  workspace_id: string | null;
  channel_id: string | null;
  thread_id: string | null;
  agent_id: string | null;
  message_id: string | null;
}

export interface DomainEvent {
  event_id: string;
  issue_id: string | null;
  run_id: string | null;
  type: string;
  state: ItemState | null;
  message: string;
  severity: Severity;
  occurred_at: IsoTimestamp;
  actor: string;
  transport: TransportCorrelation | null;
  data: Record<string, unknown>;
}

export interface LinearIssueRef {
  issue_id: string;
  title: string;
  url: string;
  state_name: string | null;
  state_type: string | null;
  project: string | null;
  labels: string[];
  assignee: string | null;
}

export interface RunSummary {
  run_id: string;
  issue_id: string;
  attempt: number;
  state: ItemState;
  flowcraft_execution_id: string | null;
  blueprint_id: string;
  blueprint_version: string;
  started_at: IsoTimestamp;
  finished_at: IsoTimestamp | null;
  worker_id: string | null;
  last_heartbeat_at: IsoTimestamp | null;
  transport: TransportCorrelation | null;
}

export interface AttemptSummary {
  issue_id: string;
  attempt: number;
  state: ItemState;
  run_id: string | null;
  started_at: IsoTimestamp | null;
  finished_at: IsoTimestamp | null;
  failed_state: ItemState | null;
  cancellation_requested: boolean;
  cancellation_requested_at: IsoTimestamp | null;
}

export interface ItemSummary {
  issue_id: string;
  title: string | null;
  url: string | null;
  state: ItemState;
  attempt: number;
  priority: number | null;
  owner: string | null;
  workspace: string | null;
  branch: string | null;
  queued_at: IsoTimestamp | null;
  started_at: IsoTimestamp | null;
  updated_at: IsoTimestamp;
  last_event: string | null;
  last_error: ErrorSummary | null;
}

export interface ItemDetail extends ItemSummary {
  linear: LinearIssueRef | null;
  current_run: RunSummary | null;
  current_worker?: WorkerSummary | null;
  cancellation_requested: boolean;
  cancellation_requested_at: IsoTimestamp | null;
  recovery_commands: string[];
  artifacts: ArtifactRef[];
  events: DomainEvent[];
}

export type EngineState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "unhealthy"
  | "unknown";

export const workerLifecycleStates = [
  "starting",
  "running",
  "completed",
  "failed",
  "canceled",
  "stale",
] as const;

export type WorkerLifecycleState = (typeof workerLifecycleStates)[number];

export type WorkerState =
  | WorkerLifecycleState
  | "cancellation-requested"
  | "exited";

export interface WorkerSummary {
  worker_id: string;
  issue_id: string | null;
  run_id: string | null;
  flowcraft_execution_id?: string | null;
  workflow_node_id?: string | null;
  phase?: string | null;
  state: WorkerState;
  pid: number | null;
  child_pid?: number | null;
  process_group_id?: number | null;
  command?: string | null;
  args?: string[];
  started_at: IsoTimestamp;
  last_heartbeat_at: IsoTimestamp | null;
  deadline_at?: IsoTimestamp | null;
  stdout_log_path?: string | null;
  stderr_log_path?: string | null;
  result?: Record<string, unknown> | null;
  result_artifact_path?: string | null;
  exit_code?: number | null;
  signal?: string | null;
  finished_at?: IsoTimestamp | null;
  transport: TransportCorrelation | null;
}

export interface HealthCheck {
  code: string;
  status: "ok" | "warning" | "error";
  message: string;
}

export interface EngineStatus {
  state: EngineState;
  pid: number | null;
  started_at: IsoTimestamp | null;
  last_tick_at: IsoTimestamp | null;
  tick_interval_seconds: number;
  queue_depth: number;
  max_concurrency: number;
  active_runs: number;
  active_workers: WorkerSummary[];
  events?: readonly DomainEvent[];
  health: HealthCheck[];
}

export interface ConfigEntry {
  key: string;
  value: ConfigValue;
  default_value: ConfigValue;
  type: "boolean" | "integer" | "string";
  source: ConfigSource;
  description: string;
  requires_engine_restart: boolean;
  bounds: { min?: number; max?: number } | null;
  allowed_values: ConfigValue[] | null;
}

export interface JsonEnvelope<TData> {
  schema_version: 1;
  ok: true;
  command: string;
  repo: RepoRef;
  data: TData;
  warnings: Warning[];
}

export interface JsonErrorEnvelope {
  schema_version: 1;
  ok: false;
  command: string;
  repo?: RepoRef;
  error: ErrorPayload;
  warnings: Warning[];
}
