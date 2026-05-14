# Autobot CLI Implementation Contracts

## Purpose

This document refines `cli-design.md` into implementation-ready contracts. It records decisions, exact schemas, transition rules, event taxonomy, and stable error codes as they are agreed. Frontloaded architecture and tooling decisions live in `decisions.md`.

## Decision Log

### 2026-05-13 MVP Command Boundary

- `autobot resume` is deferred from MVP. Human-gate FlowCraft wait-node workflows should not be required for the first implementation.
- `autobot release` is deferred from MVP. Terminal success should be set by workflow/reconcile logic until publish/release semantics are defined.
- `autobot inspect` is included in MVP as the FlowCraft/debug timeline command.

### 2026-05-13 Public State Model

- Public item state exposes lifecycle phases directly rather than collapsing them into broad `active` plus `phase` fields.
- Successful MVP terminal state is `completed`, not `released`.
- Failed items appear in default `autobot list` output because they require operator attention.

### 2026-05-13 Recovery Transition Policy

- `autobot retry` is allowed from `failed` only.
- `autobot cancel` for in-progress states records cancellation requested and waits for worker cleanup/reconciliation before final `canceled` state.
- `autobot retry` restarts from the recorded failed phase. MVP does not allow arbitrary operator phase override.

### 2026-05-13 JSON Schema Style

- JSON responses use stable reusable object shapes, even when some fields are `null`.
- Timestamps are UTC ISO-8601 strings only.
- `autobot list --json` returns summaries only. Full run, event, artifact, and FlowCraft detail belongs to `autobot status <issue> --json` and `autobot inspect --json`.

### 2026-05-13 Event Model

- Normal `autobot status` timelines show domain events only.
- Raw FlowCraft events are reserved for `autobot inspect`.
- Event type names use hierarchical dot names such as `item.queued` and `phase.failed`.
- Events are immutable and append-only. Corrections or repairs are represented as new events.

### 2026-05-13 Error Model

- Error codes are internal implementation contracts for MVP, not permanent public API yet.
- When `--json` is passed, usage errors also use the standard JSON error envelope.
- Every non-usage error must include at least one recovery command.

### 2026-05-13 Config Model

- Config precedence is flags, environment, repo config, profile config, defaults.
- Running engines reload config on the next tick where practical.
- MVP includes delivery policy config keys even if some are inert until later delivery phases.

### 2026-05-13 Discovery And Selection Policy

- Manual MVP discovery accepts repeatable `--project` flags; if none are provided, `discovery.projects` config is used, and if that is also empty the command scans all projects by omitting project flags.
- Manual discovery first fetches a bounded remote scan set (currently 100 by default, or higher when needed to satisfy `--limit`), then prunes and caps post-filter candidates by `--limit` when provided; otherwise the effective cap defaults to `engine.queue-depth`.
- REP-1170 will insert sequencing between fetch and limit.
- When `engine.auto-discover=true`, engine ticks may auto-queue eligible candidates up to `engine.queue-depth`.
- Engine selection reconciles in-progress/stale state first, then starts oldest queued items first, subject to concurrency limits.

### 2026-05-13 Human Output

- Human output tests should assert semantic content and ordering with flexible whitespace/table widths.
- Color is allowed only when stdout is a TTY and disabled by `--no-color`, pipes, or CI/non-TTY output.
- Failed and awaiting outputs must include a `Next:` line with recovery commands.

## MVP Command Set

Included:

- `autobot add`
- `autobot remove`
- `autobot list`
- `autobot status`
- `autobot logs`
- `autobot discover`
- `autobot config list|get|set|unset`
- `autobot engine status|run-once|start|stop`
- `autobot retry`
- `autobot cancel`
- `autobot reconcile`
- `autobot inspect`
- `autobot workflow list|validate|diagram`

Deferred:

- `autobot resume`
- `autobot release`
- `autobot engine restart`
- hidden `autobot internal ...` commands unless worker implementation proves they are necessary.

## Public State Model

Public item states:

- `queued`: item is waiting for engine scheduling.
- `claimed`: item has been selected and reserved by an engine/run.
- `preparing`: workspace and run artifacts are being prepared.
- `planning`: planning/context/test-plan work is in progress.
- `developing`: implementation work is in progress.
- `testing`: verification or test-agent work is in progress.
- `reviewing`: review or security-review work is in progress.
- `reconciling`: engine is comparing durable state against workers, git, Linear, GitHub, and FlowCraft history.
- `awaiting`: item is paused for a future human/external gate. Deferred from MVP as an executable behavior, but reserved in the state model.
- `failed`: item stopped on an unrecovered failure.
- `completed`: item finished successfully for MVP purposes.
- `canceled`: item was explicitly canceled.

Default `autobot list` includes all non-terminal and attention states:

- `queued`
- `claimed`
- `preparing`
- `planning`
- `developing`
- `testing`
- `reviewing`
- `reconciling`
- `awaiting`
- `failed`

Default `autobot list` excludes terminal states:

- `completed`
- `canceled`

## Transition Matrix

Normal engine-owned forward transitions:

| From          | To            | Owner           | Notes                                                    |
| ------------- | ------------- | --------------- | -------------------------------------------------------- |
| `queued`      | `claimed`     | engine          | Work selected and reserved.                              |
| `claimed`     | `preparing`   | workflow        | Run/workspace setup begins.                              |
| `preparing`   | `planning`    | workflow        | Workspace/artifacts are ready.                           |
| `planning`    | `developing`  | workflow        | Plan accepted for implementation.                        |
| `developing`  | `testing`     | workflow        | Implementation phase finished.                           |
| `testing`     | `reviewing`   | workflow        | Verification passed enough to review.                    |
| `reviewing`   | `reconciling` | workflow        | Review phase finished and final state must be inspected. |
| `reconciling` | `completed`   | engine/workflow | Successful terminal outcome confirmed.                   |
| `reconciling` | `failed`      | engine/workflow | Unrecovered mismatch or failed terminal check.           |

Failure transitions:

| From          | To       | Owner           | Notes                                            |
| ------------- | -------- | --------------- | ------------------------------------------------ |
| `claimed`     | `failed` | engine/workflow | Claim/setup failure.                             |
| `preparing`   | `failed` | workflow        | Workspace/artifact setup failure.                |
| `planning`    | `failed` | workflow        | Planning failure.                                |
| `developing`  | `failed` | workflow        | Implementation worker failure.                   |
| `testing`     | `failed` | workflow        | Verification failure.                            |
| `reviewing`   | `failed` | workflow        | Review failure or required changes not handled.  |
| `reconciling` | `failed` | engine/workflow | State mismatch cannot be repaired automatically. |

Operator-owned transitions:

| Command     | From                                                                     | To                                                              | Notes                                                                           |
| ----------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `add`       | none                                                                     | `queued`                                                        | MVP only queues items not already known locally. Terminal requeue is blocked.   |
| `remove`    | `queued`                                                                 | `canceled`                                                      | Removes runnable queued work while preserving history.                          |
| `cancel`    | `queued`                                                                 | `canceled`                                                      | Immediate cancel.                                                               |
| `cancel`    | `failed`                                                                 | `canceled`                                                      | Immediate cancel.                                                               |
| `cancel`    | `awaiting`                                                               | `canceled`                                                      | Reserved for post-MVP wait behavior.                                            |
| `cancel`    | `claimed`, `preparing`, `planning`, `developing`, `testing`, `reviewing` | current state plus cancellation request                         | Worker receives cancellation; final state is set by reconciliation.             |
| `retry`     | `failed`                                                                 | `queued`                                                        | New attempt from recorded failed phase; no arbitrary phase override in MVP.     |
| `reconcile` | any                                                                      | same state, `reconciling`, `failed`, `completed`, or `canceled` | Depends on observed worker/external state. Dry-run reports proposed transition. |

Forbidden MVP transitions:

- `retry` from `queued`, `claimed`, `preparing`, `planning`, `developing`, `testing`, `reviewing`, `reconciling`, `awaiting`, `completed`, or `canceled`.
- `remove` from in-progress states without using `cancel`.
- manual phase jumps such as retrying directly to `testing`.
- manual `completed` marking by CLI command.
- requeueing `completed` or `canceled` items.

## Domain JSON Schemas

TypeScript-style definitions below are normative for implementation.

### Base Types

```ts
type IsoTimestamp = string;

type ItemState =
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
  | "completed"
  | "canceled";

type Severity = "info" | "warning" | "error";
```

### Envelope

```ts
interface JsonEnvelope<TData> {
  schema_version: 1;
  ok: true;
  command: string;
  repo: RepoRef;
  data: TData;
  warnings: Warning[];
}

interface JsonErrorEnvelope {
  schema_version: 1;
  ok: false;
  command: string;
  repo?: RepoRef;
  error: ErrorPayload;
  warnings: Warning[];
}

interface RepoRef {
  path: string;
  state_dir: string;
}

interface Warning {
  code: string;
  message: string;
  severity: Exclude<Severity, "error">;
}
```

### Error Payload

```ts
interface ErrorPayload {
  code: string;
  message: string;
  what_failed: string;
  likely_cause: string;
  recovery_commands: string[];
  details: Record<string, unknown> | null;
}
```

### Item Summary

Used by `list`, aggregate `status`, and mutating command responses.

```ts
interface ItemSummary {
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

interface ErrorSummary {
  code: string;
  message: string;
  occurred_at: IsoTimestamp;
}
```

### Item Detail

Used by `status <issue>`.

```ts
interface ItemDetail extends ItemSummary {
  linear: LinearIssueRef | null;
  current_run: RunSummary | null;
  cancellation_requested: boolean;
  cancellation_requested_at: IsoTimestamp | null;
  recovery_commands: string[];
  artifacts: ArtifactRef[];
  events: DomainEvent[];
}

interface LinearIssueRef {
  issue_id: string;
  title: string;
  url: string;
  state_name: string | null;
  state_type: string | null;
  project: string | null;
  labels: string[];
  assignee: string | null;
}
```

### Run Summary

```ts
interface RunSummary {
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
}
```

### Domain Event

```ts
interface DomainEvent {
  event_id: string;
  issue_id: string | null;
  run_id: string | null;
  type: string;
  state: ItemState | null;
  message: string;
  severity: Severity;
  occurred_at: IsoTimestamp;
  actor: string;
  data: Record<string, unknown>;
}
```

### Artifact

```ts
type ArtifactKind =
  | "context"
  | "test-plan"
  | "prompt"
  | "log"
  | "diff"
  | "review"
  | "summary"
  | "flowcraft-history"
  | "other";

interface ArtifactRef {
  kind: ArtifactKind;
  path: string;
  description: string | null;
  created_at: IsoTimestamp;
}
```

### Engine Status

```ts
type EngineState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "unhealthy"
  | "unknown";

interface EngineStatus {
  state: EngineState;
  pid: number | null;
  started_at: IsoTimestamp | null;
  last_tick_at: IsoTimestamp | null;
  tick_interval_seconds: number;
  queue_depth: number;
  max_concurrency: number;
  active_runs: number;
  active_workers: WorkerSummary[];
  health: HealthCheck[];
}

interface WorkerSummary {
  worker_id: string;
  issue_id: string | null;
  run_id: string | null;
  state: "starting" | "running" | "cancellation-requested" | "stale" | "exited";
  pid: number | null;
  started_at: IsoTimestamp;
  last_heartbeat_at: IsoTimestamp | null;
}

interface HealthCheck {
  code: string;
  status: "ok" | "warning" | "error";
  message: string;
}
```

### Config Entry

```ts
type ConfigValue = string | number | boolean;
type ConfigSource = "default" | "profile" | "repo" | "environment" | "flag";

interface ConfigEntry {
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
```

### Command Data Shapes

```ts
interface AddData {
  changed: boolean;
  dry_run: boolean;
  item: ItemSummary;
  events: DomainEvent[];
}

interface RemoveData {
  changed: boolean;
  dry_run: boolean;
  item: ItemSummary;
  events: DomainEvent[];
}

interface ListData {
  items: ItemSummary[];
}

interface AggregateStatusData {
  engine: EngineStatus;
  counts: Record<ItemState, number>;
  items: ItemSummary[];
  config: ConfigEntry[];
}

interface ItemStatusData {
  item: ItemDetail;
}

interface ConfigListData {
  config: ConfigEntry[];
}

interface ConfigValueData {
  config: ConfigEntry;
}

interface LogsData {
  source: "engine" | "issue";
  issue_id: string | null;
  run_id: string | null;
  phase: ItemState | null;
  lines: LogLine[];
}

interface LogLine {
  occurred_at: IsoTimestamp | null;
  stream: "stdout" | "stderr" | "event" | "unknown";
  message: string;
}

interface EngineStatusData {
  engine: EngineStatus;
  config: ConfigEntry[];
}

interface EngineStartData {
  changed: boolean;
  engine: EngineStatus;
  events: DomainEvent[];
}

interface EngineStopData {
  changed: boolean;
  engine: EngineStatus;
  events: DomainEvent[];
}

interface RetryData {
  changed: boolean;
  dry_run: boolean;
  previous: ItemSummary;
  next: ItemSummary;
  retry_from_state: ItemState;
  events: DomainEvent[];
}

interface CancelData {
  changed: boolean;
  dry_run: boolean;
  item: ItemSummary;
  cancellation_requested: boolean;
  events: DomainEvent[];
}

interface ReconcileData {
  dry_run: boolean;
  scope: "issue" | "all";
  results: ReconcileResult[];
  events: DomainEvent[];
}

interface WorkflowListData {
  workflows: WorkflowSummary[];
}

interface WorkflowSummary {
  workflow_id: string;
  version: string;
  description: string | null;
}

interface WorkflowValidateData {
  workflow_id: string | null;
  valid: boolean;
  analysis: Record<string, unknown>;
  issues: WorkflowValidationIssue[];
}

interface WorkflowValidationIssue {
  code: string;
  message: string;
  node_id: string | null;
}

interface WorkflowDiagramData {
  workflow_id: string;
  format: "mermaid";
  diagram: string;
}

interface InspectData {
  run: RunSummary | null;
  item: ItemSummary | null;
  domain_events: DomainEvent[];
  flowcraft_events: unknown[];
  context_summary: Record<string, unknown>;
}
```

## Event Taxonomy

Events are append-only records. Domain projections and status timelines are derived from these records. Raw FlowCraft events may be linked through `data.flowcraft_event_id` or `data.flowcraft_execution_id`, but should not appear in normal `status` timelines.

Required fields for every event are defined by `DomainEvent`.

### Item Events

| Event                         | Severity  | Required Data                                                 | Emitted By                        |
| ----------------------------- | --------- | ------------------------------------------------------------- | --------------------------------- |
| `item.discovered`             | `info`    | `issue_id`, `title`, `project`, `priority`                    | `discover`, engine auto-discovery |
| `item.queued`                 | `info`    | `issue_id`, `queue_position`, `reason`                        | `add`, engine auto-discovery      |
| `item.duplicate_ignored`      | `warning` | `issue_id`, `existing_state`                                  | `add`, engine auto-discovery      |
| `item.removed`                | `info`    | `issue_id`, `reason`                                          | `remove`                          |
| `item.cancellation_requested` | `warning` | `issue_id`, `reason`, `force`                                 | `cancel`, `remove --force`        |
| `item.canceled`               | `info`    | `issue_id`, `reason`                                          | `cancel`, `reconcile`, workflow   |
| `item.completed`              | `info`    | `issue_id`, `run_id`, `attempt`                               | workflow, `reconcile`             |
| `item.failed`                 | `error`   | `issue_id`, `run_id`, `attempt`, `error_code`, `failed_state` | workflow, `reconcile`             |

### Run Events

| Event              | Severity  | Required Data                                                         | Emitted By                  |
| ------------------ | --------- | --------------------------------------------------------------------- | --------------------------- |
| `run.created`      | `info`    | `issue_id`, `run_id`, `attempt`, `blueprint_id`, `blueprint_version`  | engine                      |
| `run.started`      | `info`    | `issue_id`, `run_id`, `attempt`, `flowcraft_execution_id`             | engine/workflow             |
| `run.awaiting`     | `warning` | `issue_id`, `run_id`, `node_id`, `allowed_actions`                    | workflow; reserved post-MVP |
| `run.retry_queued` | `info`    | `issue_id`, `previous_run_id`, `new_run_id`, `failed_state`, `reason` | `retry`                     |
| `run.completed`    | `info`    | `issue_id`, `run_id`, `attempt`                                       | workflow                    |
| `run.failed`       | `error`   | `issue_id`, `run_id`, `attempt`, `error_code`, `message`              | workflow                    |

### Phase Events

| Event             | Severity | Required Data                                          | Emitted By |
| ----------------- | -------- | ------------------------------------------------------ | ---------- |
| `phase.started`   | `info`   | `issue_id`, `run_id`, `state`                          | workflow   |
| `phase.succeeded` | `info`   | `issue_id`, `run_id`, `state`, `duration_ms`           | workflow   |
| `phase.failed`    | `error`  | `issue_id`, `run_id`, `state`, `error_code`, `message` | workflow   |
| `phase.skipped`   | `info`   | `issue_id`, `run_id`, `state`, `reason`                | workflow   |

### Engine Events

| Event                      | Severity  | Required Data                                   | Emitted By                     |
| -------------------------- | --------- | ----------------------------------------------- | ------------------------------ |
| `engine.started`           | `info`    | `pid`, `state_dir`                              | `engine start`                 |
| `engine.stopped`           | `info`    | `pid`, `reason`                                 | `engine stop`, engine shutdown |
| `engine.tick_started`      | `info`    | `tick_id`                                       | engine                         |
| `engine.tick_finished`     | `info`    | `tick_id`, `selected_count`, `reconciled_count` | engine                         |
| `engine.idle`              | `info`    | `tick_id`, `reason`                             | engine                         |
| `engine.unhealthy`         | `error`   | `health_code`, `message`                        | engine, `engine status`        |
| `engine.duplicate_ignored` | `warning` | `existing_pid`                                  | `engine start`                 |

### Worker Events

| Event                           | Severity  | Required Data                              | Emitted By                      |
| ------------------------------- | --------- | ------------------------------------------ | ------------------------------- |
| `worker.started`                | `info`    | `worker_id`, `pid`, `issue_id`, `run_id`   | engine                          |
| `worker.heartbeat`              | `info`    | `worker_id`, `pid`, `issue_id`, `run_id`   | worker                          |
| `worker.cancellation_requested` | `warning` | `worker_id`, `issue_id`, `run_id`, `force` | `cancel`, `engine stop --force` |
| `worker.exited`                 | `info`    | `worker_id`, `exit_code`, `signal`         | engine/reconcile                |
| `worker.stale`                  | `warning` | `worker_id`, `last_heartbeat_at`           | reconcile                       |

### Reconcile Events

| Event                      | Severity  | Required Data                                       | Emitted By          |
| -------------------------- | --------- | --------------------------------------------------- | ------------------- |
| `reconcile.started`        | `info`    | `scope`                                             | `reconcile`, engine |
| `reconcile.mismatch_found` | `warning` | `issue_id`, `mismatch_code`, `observed`, `expected` | reconcile           |
| `reconcile.repair_applied` | `info`    | `issue_id`, `repair_code`, `from_state`, `to_state` | reconcile           |
| `reconcile.repair_failed`  | `error`   | `issue_id`, `repair_code`, `error_code`, `message`  | reconcile           |
| `reconcile.finished`       | `info`    | `scope`, `mismatch_count`, `repair_count`           | reconcile           |

### Config Events

| Event            | Severity | Required Data                             | Emitted By     |
| ---------------- | -------- | ----------------------------------------- | -------------- |
| `config.changed` | `info`   | `key`, `old_value`, `new_value`, `source` | `config set`   |
| `config.unset`   | `info`   | `key`, `old_value`, `new_value`           | `config unset` |
| `config.invalid` | `error`  | `key`, `value`, `reason`                  | `config set`   |

### Inspect-Only FlowCraft Events

`autobot inspect` may include raw FlowCraft event records under an inspect-specific `flowcraft_events` array. These records are not part of `DomainEvent` and are not displayed in `status` unless explicitly requested by a future debug flag.

## Error Code Catalog

Error codes are stable within an implementation release but are not yet a long-term public API. Every JSON error uses `ErrorPayload`. Every non-usage error must include `recovery_commands`.

### Usage And Input Errors

| Code                     | Exit | Meaning                                            | Typical Recovery Commands                                           |
| ------------------------ | ---- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `USAGE_INVALID_ARGUMENT` | `2`  | Argument failed parser or shape validation.        | `autobot <command> --help`                                          |
| `USAGE_MISSING_ARGUMENT` | `2`  | Required positional or option argument is missing. | `autobot <command> --help`                                          |
| `USAGE_UNKNOWN_OPTION`   | `2`  | Unknown flag was provided.                         | `autobot <command> --help`                                          |
| `ISSUE_ID_INVALID`       | `2`  | Issue selector is not a valid Linear key.          | `autobot add REP-123 --dry-run`                                     |
| `CONFIG_VALUE_INVALID`   | `2`  | Config value cannot be parsed or is out of bounds. | `autobot config list`, `autobot config set <key> <value> --dry-run` |

### Repository And Store Errors

| Code                       | Exit | Meaning                                                     | Typical Recovery Commands                                       |
| -------------------------- | ---- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| `REPO_NOT_FOUND`           | `1`  | No repository root/state root could be resolved.            | `autobot --repo <path> status`                                  |
| `REPO_WRONG_WORKTREE`      | `1`  | Command must be run from main checkout or with `--repo`.    | `autobot --repo <main-checkout> status`                         |
| `STATE_DIR_UNAVAILABLE`    | `4`  | `.autobot/` cannot be created or read.                      | `autobot status --verbose`, `autobot reconcile --all --dry-run` |
| `STATE_STORE_LOCKED`       | `4`  | SQLite/store lock could not be acquired.                    | `autobot engine status`, `autobot reconcile --all --dry-run`    |
| `STATE_STORE_CORRUPT`      | `4`  | Store failed integrity or migration check.                  | `autobot status --verbose`, `autobot inspect <run-id> --json`   |
| `STATE_MIGRATION_REQUIRED` | `4`  | Store version is older than CLI supports without migration. | `autobot status --verbose`                                      |

### Item State Errors

| Code                            | Exit | Meaning                                                            | Typical Recovery Commands                                         |
| ------------------------------- | ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `ITEM_NOT_FOUND`                | `1`  | Item does not exist in local Autobot state.                        | `autobot discover --limit 10`, `autobot add <issue> --dry-run`    |
| `ITEM_ALREADY_QUEUED`           | `1`  | Item already exists in a non-terminal state.                       | `autobot status <issue>`, `autobot list`                          |
| `ITEM_TERMINAL_REQUEUE_BLOCKED` | `1`  | Terminal item cannot be queued again by current policy.            | `autobot status <issue> --json`                                   |
| `ITEM_NOT_REMOVABLE`            | `1`  | Item is in progress and cannot be removed directly.                | `autobot cancel <issue> --reason "..."`, `autobot status <issue>` |
| `ITEM_NOT_CANCELABLE`           | `1`  | Item state does not allow cancellation.                            | `autobot status <issue>`                                          |
| `ITEM_NOT_RETRYABLE`            | `1`  | Item is not in `failed` state.                                     | `autobot status <issue>`, `autobot reconcile <issue> --dry-run`   |
| `ITEM_CANCELLATION_PENDING`     | `1`  | Cancellation was already requested and is awaiting reconciliation. | `autobot reconcile <issue> --dry-run`, `autobot status <issue>`   |

### Engine And Worker Errors

| Code                     | Exit | Meaning                                          | Typical Recovery Commands                                                               |
| ------------------------ | ---- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `ENGINE_ALREADY_RUNNING` | `5`  | Engine lock/PID indicates an active daemon.      | `autobot engine status`, `autobot logs --engine -t`                                     |
| `ENGINE_NOT_RUNNING`     | `5`  | Stop/status operation expected a running engine. | `autobot engine start`, `autobot engine run-once --dry-run`                             |
| `ENGINE_START_FAILED`    | `5`  | Engine process could not start.                  | `autobot engine status --verbose`, `autobot logs --engine`                              |
| `ENGINE_STOP_FAILED`     | `5`  | Engine did not stop within timeout.              | `autobot engine stop --force`, `autobot engine status --verbose`                        |
| `WORKER_START_FAILED`    | `5`  | Worker process/job could not start.              | `autobot status <issue>`, `autobot retry <issue> --dry-run`                             |
| `WORKER_STALE`           | `5`  | Worker heartbeat is stale.                       | `autobot reconcile <issue> --dry-run`, `autobot cancel <issue> --reason "stale worker"` |
| `WORKER_CANCEL_FAILED`   | `5`  | Worker did not acknowledge cancellation.         | `autobot engine stop --force`, `autobot reconcile <issue> --dry-run`                    |

### External Dependency Errors

| Code                     | Exit | Meaning                                               | Typical Recovery Commands                                                 |
| ------------------------ | ---- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `LINEAR_UNAVAILABLE`     | `3`  | Linear CLI/API failed.                                | `autobot discover --dry-run`, `autobot status --verbose`                  |
| `LINEAR_ISSUE_NOT_FOUND` | `3`  | Linear issue lookup failed.                           | `autobot discover --limit 10`, `autobot add <issue> --dry-run`            |
| `GIT_UNAVAILABLE`        | `3`  | Git command failed or repo state invalid.             | `autobot status <issue> --verbose`, `autobot reconcile <issue> --dry-run` |
| `WORKTREE_PREP_FAILED`   | `3`  | Worktree setup failed.                                | `autobot status <issue>`, `autobot retry <issue> --dry-run`               |
| `OPENCODE_UNAVAILABLE`   | `3`  | OpenCode executable/session failed before work began. | `autobot status <issue>`, `autobot retry <issue> --dry-run`               |
| `GITHUB_UNAVAILABLE`     | `3`  | GitHub/PR/CI inspection failed.                       | `autobot reconcile <issue> --dry-run`, `autobot status <issue>`           |

### Workflow Errors

| Code                           | Exit | Meaning                                         | Typical Recovery Commands                                                            |
| ------------------------------ | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `WORKFLOW_NOT_FOUND`           | `1`  | Requested workflow/blueprint is not registered. | `autobot workflow list`, `autobot workflow validate --json`                          |
| `WORKFLOW_INVALID`             | `1`  | FlowCraft analysis/lint failed.                 | `autobot workflow validate <workflow> --json`, `autobot workflow diagram <workflow>` |
| `WORKFLOW_EXECUTION_FAILED`    | `1`  | FlowCraft execution failed.                     | `autobot inspect <run-id> --json`, `autobot status <issue>`                          |
| `WORKFLOW_HISTORY_UNAVAILABLE` | `4`  | FlowCraft history cannot be read.               | `autobot inspect <run-id> --json`, `autobot status --verbose`                        |
| `RECONCILE_FAILED`             | `1`  | Reconcile found a mismatch it could not repair. | `autobot reconcile <issue> --dry-run`, `autobot inspect <run-id> --json`             |

### Error Envelope Rules

- `message` should be one sentence suitable for human display.
- `what_failed` names the failed operation, not the exception class.
- `likely_cause` should be concrete and falsifiable when possible.
- `recovery_commands` should contain commands that are safe to run. Prefer `--dry-run` for mutating recovery suggestions.
- `details` may include parser diagnostics, dependency stderr summaries, store paths, issue IDs, run IDs, or health check results.

## Config Contract

Config is resolved from highest to lowest precedence:

1. Command flags.
2. Environment variables.
3. Repo config in `.autobot/config.json`.
4. Profile config in `.autobot/profiles/<profile>.json` or equivalent future profile store.
5. Built-in defaults.

Config commands modify repo config only. They do not write environment variables, profile config, or defaults.

Running engines should reload config on the next tick where practical. `requires_engine_restart` should be `false` for MVP keys unless implementation proves a key cannot be safely reloaded.

### MVP Keys

| Key                            | Type    | Default | Bounds / Values                                 | Env Var                                | Requires Restart | Description                                                                                              |
| ------------------------------ | ------- | ------- | ----------------------------------------------- | -------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `engine.auto-discover`         | boolean | `false` | `true`/`false`                                  | `AUTOBOT_ENGINE_AUTO_DISCOVER`         | `false`          | Whether engine ticks may discover and queue candidate work automatically.                                |
| `engine.queue-depth`           | integer | `5`     | `0..100`                                        | `AUTOBOT_ENGINE_QUEUE_DEPTH`           | `false`          | Maximum queued-but-not-running items maintained by auto-discovery. `0` disables auto-queueing.           |
| `engine.max-concurrency`       | integer | `1`     | `1..16`                                         | `AUTOBOT_ENGINE_MAX_CONCURRENCY`       | `false`          | Maximum active runs the local engine may supervise at once.                                              |
| `engine.tick-interval-seconds` | integer | `15`    | `1..3600`                                       | `AUTOBOT_ENGINE_TICK_INTERVAL_SECONDS` | `false`          | Delay between daemon scheduler ticks.                                                                    |
| `delivery.require-review`      | boolean | `true`  | `true`/`false`                                  | `AUTOBOT_DELIVERY_REQUIRE_REVIEW`      | `false`          | Whether delivery workflow must include a review gate before completion.                                  |
| `delivery.allow-release`       | boolean | `false` | `true`/`false`                                  | `AUTOBOT_DELIVERY_ALLOW_RELEASE`       | `false`          | Whether automated publish/release behavior is allowed. Inert while manual/automated release is deferred. |
| `logs.retention-days`          | integer | `30`    | `1..365`                                        | `AUTOBOT_LOGS_RETENTION_DAYS`          | `false`          | Retention target for future log/artifact cleanup. MVP may report but not enforce this.                   |
| `discovery.project`            | string  | `""`    | non-empty string when auto-discovery is enabled | `AUTOBOT_DISCOVERY_PROJECT`            | `false`          | Default Linear project used by `discover` and engine auto-discovery when `--project` is not supplied.    |

### Value Parsing

- Boolean accepted inputs: `true`, `false`, `on`, `off`, `yes`, `no`, `1`, `0`.
- Integer inputs must be base-10 whole numbers within bounds.
- String inputs are accepted only for string-typed keys. `discovery.project` may be an empty string only when auto-discovery is disabled or when a command supplies `--project`.
- Unknown keys fail with `CONFIG_VALUE_INVALID` or a more specific future `CONFIG_KEY_UNKNOWN` if added.
- `config set` should show the parsed canonical value in dry-run and success output.

### `config list --json`

`config list --json` returns `ConfigListData` with one `ConfigEntry` per known key. `source` must indicate the winning layer. If a flag overrides config for the current command only, `source` is `flag` in that command response but persisted repo config is unchanged.

### `config get --json`

`config get --json` returns `ConfigValueData` for one key.

### `config set --json`

`config set --json` returns:

```ts
interface ConfigSetData {
  changed: boolean;
  dry_run: boolean;
  previous: ConfigEntry;
  next: ConfigEntry;
  events: DomainEvent[];
}
```

### `config unset --json`

`config unset --json` returns:

```ts
interface ConfigUnsetData {
  changed: boolean;
  dry_run: boolean;
  previous: ConfigEntry;
  next: ConfigEntry;
  events: DomainEvent[];
}
```

## Discovery Policy

MVP discovery is project-scoped. A command must provide a Linear project through `--project <name>` or `discovery.project`. If no project is available, discovery fails with a usage/input error and suggests adding `--project` or setting `discovery.project`.

### Eligibility

An issue is eligible when all are true:

- It belongs to the selected Linear project.
- It is not already known locally in a non-terminal Autobot state.
- It is not completed/canceled in Linear.
- It has enough issue metadata to produce a title, URL, priority, and state.
- It does not have an explicit exclusion marker once exclusion labels are added in a future version.

MVP does not require a special Autobot-ready label unless the operator filters with `--label`.

### Exclusion Reasons

Discovery JSON should include exclusion reasons when `--verbose --json` is used.

Initial exclusion reason codes:

- `already-known`: item exists locally in a non-terminal state.
- `linear-terminal`: Linear issue appears completed/canceled.
- `missing-metadata`: required Linear fields were unavailable.
- `project-mismatch`: issue does not belong to selected project.
- `label-mismatch`: `--label` was provided and issue does not match.
- `priority-mismatch`: `--priority` was provided and issue does not match.

### `discover --json`

```ts
interface DiscoverData {
  project: string;
  limit: number;
  scan_limit: number;
  candidates: DiscoveryCandidate[];
  excluded: DiscoveryExclusion[];
}

interface DiscoveryCandidate {
  issue_id: string;
  title: string;
  url: string;
  project: string;
  priority: number | null;
  labels: string[];
  linear_state_name: string | null;
  linear_state_type: string | null;
}

interface DiscoveryExclusion {
  issue_id: string;
  title: string | null;
  reason: string;
  message: string;
}
```

Without `--verbose`, `excluded` may be an empty array even when exclusions occurred.

## Engine Selection Policy

Each engine tick runs in this order:

1. Load effective config.
2. Reconcile known in-progress, cancellation-requested, stale, and failed/ambiguous runs.
3. If `engine.auto-discover=true`, discover eligible candidates for `discovery.project` and auto-queue until queued count reaches `engine.queue-depth`. If `discovery.project` is empty, emit an `engine.unhealthy` warning and skip auto-discovery.
4. Count active states: `claimed`, `preparing`, `planning`, `developing`, `testing`, `reviewing`, `reconciling`.
5. Start new runs from `queued` while active count is below `engine.max-concurrency`.
6. Emit tick summary events and log lines.

### Queue Ordering

Runnable queued items are ordered by:

1. `queued_at` ascending.
2. queue position ascending if stored separately.
3. `issue_id` ascending as deterministic tie-breaker.

Linear priority does not reorder already queued items in MVP. Priority may still be displayed and may be used by discovery filters.

### Duplicate Suppression

- Auto-discovery must not queue an issue already known in a non-terminal state.
- Manual `add` must fail with `ITEM_ALREADY_QUEUED` for non-terminal duplicates.
- Terminal requeue policy remains conservative: re-adding `completed` or `canceled` items is blocked unless a future explicit rerun policy is added.

### `engine run-once --json`

```ts
interface EngineRunOnceData {
  dry_run: boolean;
  engine: EngineStatus;
  discovered: DiscoveryCandidate[];
  queued: ItemSummary[];
  selected: ItemSummary[];
  reconciled: ReconcileResult[];
  events: DomainEvent[];
}

interface ReconcileResult {
  issue_id: string | null;
  run_id: string | null;
  changed: boolean;
  from_state: ItemState | null;
  to_state: ItemState | null;
  message: string;
}
```

## Human Output Golden Examples

Tests should assert these examples semantically:

- Required headings and labels are present.
- Rows appear in the documented order.
- Key values and suggested commands match exactly.
- Whitespace, column padding, and TTY color are flexible.

### Empty Aggregate Status

```text
Autobot engine: stopped
State dir: /repo/.autobot

Queue
queued=0 claimed=0 preparing=0 planning=0 developing=0 testing=0 reviewing=0 reconciling=0 awaiting=0 failed=0 completed=0 canceled=0

No queued or in-progress items.
Next: autobot discover --project <name>
```

### Aggregate Status With Active And Failed Items

```text
Autobot engine: running pid=12345 last_tick=2026-05-13T12:30:00.000Z
Concurrency: 1/2 active

ISSUE    STATE       ATTEMPT  OWNER                    TITLE
REP-123  developing  1        worker:abc               Add billing retry flow
REP-124  failed      2        -                         Fix flaky capture test
REP-125  queued      0        -                         Update docs

Attention
REP-124 failed during testing: moon test failed
Next: autobot status REP-124
```

### Queued Item Detail

```text
REP-125 Update docs
State: queued
Attempt: 0
Workspace: -
Run: -

Timeline
2026-05-13T12:00:00.000Z  item.queued  Queued by user

Next: autobot engine run-once --dry-run
```

### Active Item Detail

```text
REP-123 Add billing retry flow
State: developing
Attempt: 1
Run: run_abc123
FlowCraft: fc_exec_123 autobot-deliver-issue@1.0.0
Workspace: /repo/.worktrees/REP-123
Branch: gary/rep-123-add-billing-retry-flow
Worker: worker:abc pid=23456 last_heartbeat=2026-05-13T12:29:58.000Z

Timeline
2026-05-13T12:00:00.000Z  item.queued     Queued by user
2026-05-13T12:10:00.000Z  run.started     Started attempt 1
2026-05-13T12:11:00.000Z  phase.started   preparing
2026-05-13T12:12:00.000Z  phase.succeeded preparing
2026-05-13T12:15:00.000Z  phase.started   developing

Next: autobot logs REP-123 -t
```

### Failed Item Detail

```text
REP-124 Fix flaky capture test
State: failed
Attempt: 2
Run: run_def456
Last failed state: testing
Error: TEST_COMMAND_FAILED moon test failed

Timeline
2026-05-13T11:00:00.000Z  item.queued   Queued by user
2026-05-13T11:20:00.000Z  phase.started testing
2026-05-13T11:22:00.000Z  phase.failed  testing: moon test failed
2026-05-13T11:22:01.000Z  item.failed   Stopped in testing

Next: autobot retry REP-124 --dry-run
Next: autobot inspect run_def456 --json
Next: autobot cancel REP-124 --reason "no longer needed"
```

### Cancellation Requested Detail

```text
REP-123 Add billing retry flow
State: developing
Cancellation: requested at 2026-05-13T12:31:00.000Z
Worker: worker:abc pid=23456 last_heartbeat=2026-05-13T12:31:02.000Z

The worker is still shutting down. Final canceled state will be confirmed by reconciliation.
Next: autobot reconcile REP-123 --dry-run
Next: autobot logs REP-123 -t
```

### Completed Item Detail

```text
REP-126 Add config list command
State: completed
Attempt: 1
Run: run_xyz789

Timeline
2026-05-13T10:00:00.000Z  item.queued     Queued by user
2026-05-13T10:05:00.000Z  run.started     Started attempt 1
2026-05-13T10:45:00.000Z  item.completed  Delivery completed

Next: autobot inspect run_xyz789 --json
```

### Discover Output

```text
Found 2 candidates in Engineering

ISSUE    PRIORITY  STATE       TITLE
REP-123  3         Todo        Add billing retry flow
REP-124  2         Backlog     Fix flaky capture test

Queue them with:
autobot discover --project Engineering -q | xargs -n1 autobot add
```

### Config List Output

```text
KEY                           VALUE  SOURCE   DESCRIPTION
engine.auto-discover          false  default  Whether engine ticks may discover and queue candidate work automatically.
engine.queue-depth            5      default  Maximum queued-but-not-running items maintained by auto-discovery.
engine.max-concurrency        1      default  Maximum active runs the local engine may supervise at once.
engine.tick-interval-seconds  15     default  Delay between daemon scheduler ticks.
delivery.require-review       true   default  Whether delivery workflow must include a review gate before completion.
delivery.allow-release        false  default  Whether automated publish/release behavior is allowed.
logs.retention-days           30     default  Retention target for future log/artifact cleanup.
discovery.project             ""     default  Default Linear project used by discovery and engine auto-discovery.
```

### Engine Run Once Dry Run Output

```text
Engine dry run
Would reconcile: 1 item
Would discover: disabled
Would start: 1 item

ISSUE    STATE   REASON
REP-125  queued  oldest queued item and capacity available

Next: autobot engine run-once
```

## Remaining Refinement Before Implementation

The CLI contract is now specific enough for parser, renderer, store-query, and response-envelope implementation. Before implementing engine/workflow behavior, still refine:

- Exact store schema/migrations.
- FlowCraft blueprint IDs, versions, and node registry names.
- Real Linear field mapping and API/CLI integration details.
- Real worktree/OpenCode adapter process contracts.
- Test command selection for `testing` phase.
- Exact raw FlowCraft event fields inside `InspectData.flowcraft_events` once the FlowCraft prototype confirms APIs. The CLI contract already fixes where those records appear.
