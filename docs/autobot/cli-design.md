# Autobot CLI Design Spec

## Purpose

This document defines the target greenfield `autobot-next` CLI contract. It is a companion to `greenfield-plan.md` and should be treated as the implementation basis for the CLI, JSON response shapes, operator semantics, and recovery controls.

The spec intentionally describes a new CLI. It preserves the useful public concepts from the current docs, but it does not attempt to maintain implementation compatibility with the existing shell/Python/TypeScript code.

## Product Positioning

`autobot-next` is the repo-owned local automation CLI for Linear work items. It exposes queue, engine, status, logs, config, and recovery controls in operator language.

The CLI is not a raw FlowCraft CLI. FlowCraft execution IDs, node IDs, and blueprint internals may appear in debug commands and JSON diagnostics, but the primary user model is:

- Work item: a Linear issue known to Autobot.
- Queue: local backlog of work items eligible for automated delivery.
- Run: one delivery attempt for one item.
- Phase/state: a user-understandable lifecycle step such as queued, preparing, planning, developing, testing, reviewing, reconciling, failed, completed, or canceled.
- Engine: local scheduler/supervisor that starts and reconciles runs.
- Worker: process or distributed job doing a bounded side effect.

## Design Goals

- Keep common operator commands short and safe.
- Use queue/item language by default; keep internal claim/run terminology out of the happy path.
- Make every mutating command support `--dry-run` where meaningful.
- Make every command that returns structured information support `--json`.
- Make status useful without requiring database access, raw logs, or FlowCraft knowledge.
- Make failures actionable: every error response should explain what failed, why it likely failed, and exact recovery commands.
- Keep low-level lifecycle mutation commands available only when they are useful for recovery/debugging.
- Allow a local MVP while leaving room for distributed FlowCraft execution later.

## Non-Goals

- Do not expose FlowCraft as the primary product vocabulary.
- Do not require the legacy lifecycle surface for normal use.
- Do not expose internal worker locks, lease tokens, raw context blobs, or database table names in default human output.
- Do not make `autobot-next` responsible for merging PRs or bypassing review gates.
- Do not hide destructive actions behind ambiguous verbs.

## Global Invocation

```bash
autobot-next <command> [options]
```

Global options:

- `--json` emits machine-readable JSON.
- `--repo <path>` runs against a repository root other than the current directory.
- `--state-dir <path>` overrides the default `.autobot/` state directory for tests/sandboxing.
- `--profile <name>` selects an Autobot profile when multiple policy/config profiles exist.
- `--quiet` suppresses non-essential human output.
- `--verbose` includes additional diagnostic context in human output.
- `--no-color` disables terminal color.

Rules:

- Default repository is the nearest enclosing Git worktree with an Autobot state root.
- Default state directory is `<repo>/.autobot/`.
- Commands that need the main checkout must fail with a recovery hint when run from an issue worktree unless `--repo` is provided.
- `--json` output must never include ANSI color or human table formatting.

## Exit Codes

- `0`: command succeeded.
- `1`: expected command failure, such as invalid state transition, missing item, or failed validation.
- `2`: usage error, invalid flags, invalid argument shape.
- `3`: external dependency failure, such as Linear, git, GitHub, or OpenCode unavailable.
- `4`: state store failure, such as locked/corrupt/unmigrated SQLite state.
- `5`: engine/worker lifecycle failure.
- `10`: command completed but found unhealthy status, used by health/check commands.

## JSON Envelope

All JSON responses use a top-level object.

Base success envelope:

```json
{
  "schema_version": 1,
  "ok": true,
  "command": "status",
  "repo": {
    "path": "/repo",
    "state_dir": "/repo/.autobot"
  },
  "data": {},
  "warnings": []
}
```

Base error envelope:

```json
{
  "schema_version": 1,
  "ok": false,
  "command": "retry",
  "error": {
    "code": "ITEM_NOT_RETRYABLE",
    "message": "REP-123 cannot be retried from completed state.",
    "what_failed": "Autobot refused to create a retry attempt.",
    "likely_cause": "The item is already terminal and has no failed run.",
    "recovery_commands": [
      "autobot-next status REP-123 --json",
      "autobot-next add REP-123 --dry-run"
    ]
  },
  "warnings": []
}
```

Mutating success responses include:

- `changed`: boolean.
- `dry_run`: boolean.
- `events`: array of emitted domain events.
- `item`: the affected item when there is one.

Status-oriented responses include:

- `config`: effective config snapshot.
- `engine`: engine status snapshot when relevant.
- `items`: item summaries when relevant.
- `events`: event timeline when relevant.

## Public State Vocabulary

The CLI uses lifecycle phases as public item states in human output and JSON summaries:

- `queued`: item is waiting for engine scheduling.
- `claimed`: item has been selected and reserved by an engine/run.
- `preparing`: workspace and run artifacts are being prepared.
- `planning`: planning/context/test-plan work is in progress.
- `developing`: implementation work is in progress.
- `testing`: verification or test-agent work is in progress.
- `reviewing`: review or security-review work is in progress.
- `reconciling`: engine is comparing durable state against workers, git, Linear, GitHub, and FlowCraft history.
- `awaiting`: item is paused for a future human/external gate. This state is reserved, but human-gate resume behavior is deferred from MVP.
- `failed`: item stopped on an unrecovered failure.
- `completed`: item finished successfully for MVP purposes.
- `canceled`: item was explicitly canceled.

Internal-only states should be hidden unless `--verbose` or `--json` diagnostic fields are requested:

- worker lock/lease state.
- raw FlowCraft statuses such as `stalled` or `cancelled`; these should be mapped to public states such as `failed`, `awaiting`, or `canceled` plus diagnostics.
- raw node IDs, unless in `engine debug workflow` or `inspect` debug commands.

## Item Identity

Primary item identity is a Linear issue key such as `REP-123`.

Accepted item selectors:

- `REP-123`: exact issue key.
- `rep-123`: normalized to uppercase.
- FlowCraft run ID only for debug commands such as `inspect`.

Rejected selectors:

- bare numeric issue IDs.
- ambiguous branch names.
- PR URLs, unless a future `autobot-next import` command is added.

## Command Groups

### Queue Commands

#### `autobot-next add`

```bash
autobot-next add <issue> [--json] [--dry-run] [--priority <n>] [--reason <text>]
```

Queues a Linear issue for automated delivery. This command does not create a worktree or start delivery directly.

Semantics:

- Validates issue key format.
- Fetches issue metadata unless offline mode is explicitly introduced later.
- Refuses duplicate non-terminal queue entries.
- Re-adding a `completed` or `canceled` item is blocked in MVP unless a future explicit rerun policy is added.
- Emits `item.queued` when changed.
- With `--dry-run`, reports what would be queued and why.

Human output:

```text
Queued REP-123: Short issue title
State: queued
Next: engine will pick this up when capacity is available
```

JSON `data` shape:

```json
{
  "changed": true,
  "dry_run": false,
  "item": {
    "issue_id": "REP-123",
    "title": "Short issue title",
    "state": "queued",
    "priority": 3,
    "queued_at": "2026-05-13T12:00:00.000Z"
  },
  "events": []
}
```

#### `autobot-next remove`

```bash
autobot-next remove <issue> [--json] [--dry-run] [-f|--force] [--reason <text>]
```

Removes queued work or requests cancellation for in-progress work.

Semantics:

- For `queued` items, removes the item from the runnable queue and emits `item.removed`.
- For `awaiting` or `failed` items, marks the item `canceled` unless `--force` is required by policy.
- For in-progress items, default behavior refuses immediate removal and suggests `autobot-next cancel`. With `--force`, it writes a cancellation request and lets reconciliation clean up workers.
- Never deletes run history or logs.
- Does not remove worktrees by default. If future cleanup is added, it should require an explicit `--cleanup-workspace` flag.

Human output for in-progress without force:

```text
REP-123 is developing and cannot be removed directly.
Use: autobot-next cancel REP-123 --reason "..."
```

#### `autobot-next list`

```bash
autobot-next list [--json] [--state <state>] [--all] [--limit <n>]
```

Lists work items.

Semantics:

- Default shows non-terminal and attention states: `queued`, `claimed`, `preparing`, `planning`, `developing`, `testing`, `reviewing`, `reconciling`, `awaiting`, and `failed`.
- `--state` filters by public state.
- `--all` includes `completed` and `canceled`.
- Human output is a compact table.

Human columns:

- `ISSUE`
- `STATE`
- `ATTEMPT`
- `AGE`
- `OWNER`
- `TITLE`

JSON `data` shape:

```json
{
  "items": [
    {
      "issue_id": "REP-123",
      "title": "Short issue title",
      "state": "developing",
      "attempt": 1,
      "owner": "autobot-next:pid-12345",
      "queued_at": "2026-05-13T12:00:00.000Z",
      "updated_at": "2026-05-13T12:15:00.000Z"
    }
  ]
}
```

### Status And Logs

#### `autobot-next status`

```bash
autobot-next status [issue] [--json] [--events] [--all] [--verbose]
```

Without an issue, shows engine and queue summary. With an issue, shows per-item detail.

Aggregate human output must answer:

- Is the engine running?
- How many items are in each public state?
- What in-progress items are doing now?
- Whether there are stale workers, blocked waits, or failed items.
- What command to run next.

Aggregate JSON `data` shape:

```json
{
  "engine": {
    "state": "running",
    "pid": 12345,
    "started_at": "2026-05-13T12:00:00.000Z",
    "last_tick_at": "2026-05-13T12:30:00.000Z",
    "max_concurrency": 2,
    "active_runs": 1
  },
  "counts": {
    "queued": 3,
    "developing": 1,
    "awaiting": 0,
    "failed": 1,
    "completed": 5,
    "canceled": 0
  },
  "items": [],
  "config": {}
}
```

Per-item human output includes:

- issue title and URL.
- public state and last failed state when applicable.
- current run ID, attempt, FlowCraft execution ID.
- workspace path and branch when present.
- worker owner and heartbeat when in progress.
- timeline of queue, claim, prepare, phase, wait, failure, retry, reconcile, complete, and cancel events.
- last error and recovery commands when failed or awaiting.
- artifact paths.

Per-item JSON `data` shape:

```json
{
  "item": {
    "issue_id": "REP-123",
    "title": "Short issue title",
    "url": "https://linear.app/...",
    "state": "failed",
    "last_phase": "testing",
    "attempt": 2,
    "workspace": "/repo/.worktrees/REP-123",
    "branch": "gary/rep-123-short-title"
  },
  "run": {
    "run_id": "run_abc123",
    "flowcraft_execution_id": "fc_exec_123",
    "blueprint_id": "autobot-deliver-issue",
    "blueprint_version": "1.0.0"
  },
  "events": [],
  "artifacts": [],
  "recovery_commands": []
}
```

#### `autobot-next logs`

```bash
autobot-next logs [issue|--engine] [-t|--tail] [--json] [--lines <n>] [--phase <phase>]
```

Shows engine or issue logs.

Semantics:

- Default with no issue is engine logs.
- `autobot-next logs REP-123` shows issue/run logs, newest attempt by default.
- `--phase` filters phase logs when available.
- `-t` follows logs until interrupted.
- JSON mode does not stream unless a future JSON-lines mode is explicitly added.

### Discovery

#### `autobot-next discover`

```bash
autobot-next discover [--limit <n>] [--project <name>]... [--label <name>] [--priority <n>] [-q|--quiet] [--json]
```

Discovers Linear issues eligible for Autobot.

Semantics:

- Applies configured policy filters plus explicit flags.
- Does not queue anything by default.
- Excludes issues already known as non-terminal items unless `--all` is added in a future version.
- With no `--project` flags, manual discovery scans all projects unless `discovery.projects` is configured.
- `--limit` caps the post-filter candidate set; when omitted, discovery defaults the cap to `engine.queue-depth`.
- Discovery first fetches a bounded remote scan set (currently 100 by default, or higher when needed to satisfy `--limit`), then prunes and applies the candidate cap.
- REP-1170 will insert agent-led sequencing between fetch and limit.
- `-q` prints issue IDs only, one per line, for piping into `autobot-next add`.
- JSON output always includes the scan count, scan limit, effective candidate limit, candidate metadata, issue IDs, and exclusion reasons.

Human output:

```text
Found 3 candidates
Limit: 5
REP-123  Normal  Engineering  Short title
REP-124  High    Platform     Another title

Queue them with:
  autobot-next discover -q | xargs -n1 autobot-next add
```

### Config

#### `autobot-next config list`

```bash
autobot-next config list [--json]
```

Shows all known config keys, effective values, source, and description.

Required keys for MVP:

- `engine.auto-discover`: boolean, default `false`.
- `engine.queue-depth`: integer, default `5`.
- `engine.max-concurrency`: integer, default `1`.
- `engine.tick-interval-seconds`: integer, default `15`.
- `discovery.projects`: string, default empty comma-separated allowlist.
- `delivery.require-review`: boolean, default `true`.
- `delivery.allow-release`: boolean, default `false` for MVP.
- `logs.retention-days`: integer, default `30`.

#### `autobot-next config get`

```bash
autobot-next config get <key> [--json]
```

Reads one effective config value.

#### `autobot-next config set`

```bash
autobot-next config set <key> <value> [--json] [--dry-run]
```

Validates and persists one override.

Value parsing:

- booleans accept `true`, `false`, `on`, `off`, `yes`, `no`, `1`, `0`.
- integers must be base-10 and within key-specific bounds.
- strings are accepted only for string-typed keys.

#### `autobot-next config unset`

```bash
autobot-next config unset <key> [--json] [--dry-run]
```

Removes one override and falls back to default/profile value.

### Engine

#### `autobot-next engine status`

```bash
autobot-next engine status [--json] [--verbose]
```

Shows daemon lifecycle, PID, uptime, last tick, config, active workers, and health warnings.

#### `autobot-next engine start`

```bash
autobot-next engine start [--foreground] [--json] [--once]
```

Starts the local engine.

Semantics:

- Refuses to start a duplicate engine for the same state dir.
- `--foreground` runs in the current process and logs to stdout/stderr.
- `--once` is an alias for `autobot-next engine run-once` and should not daemonize.
- Writes `engine.started` event.

#### `autobot-next engine stop`

```bash
autobot-next engine stop [--json] [--timeout <seconds>] [-f|--force]
```

Stops the local engine.

Semantics:

- Requests graceful shutdown first.
- Does not kill active worker processes unless `--force` is provided.
- With `--force`, records cancellation/reconciliation-needed events for active workers.

#### `autobot-next engine restart` (deferred)

```bash
autobot-next engine restart [--json]
```

Deferred from MVP. Future command stops then starts the engine.

#### `autobot-next engine run-once`

```bash
autobot-next engine run-once [--json] [--dry-run]
```

Runs one scheduler tick without daemonizing.

Semantics:

- Performs auto-discovery if `engine.auto-discover=true` and a project is configured.
- Selects eligible work.
- Starts executions up to concurrency limits.
- Reconciles stale/awaiting/failed state.
- In `--dry-run`, reports what would be selected or reconciled.

### Recovery Controls

#### `autobot-next retry`

```bash
autobot-next retry <issue> [--reason <text>] [--json] [--dry-run]
```

Creates a new attempt for a failed item.

Semantics:

- Retry phase is the recorded failed phase. MVP does not support arbitrary operator phase override.
- Clears stale worker ownership for the new attempt.
- Preserves prior run history.

#### `autobot-next cancel`

```bash
autobot-next cancel <issue> [--reason <text>] [--json] [--dry-run] [-f|--force]
```

Requests cancellation for queued, awaiting, failed, or in-progress items.

Semantics:

- Queued items become `canceled` immediately.
- Awaiting/failed items become `canceled` immediately.
- Active items receive a cancellation request; worker shutdown is graceful unless `--force` is used. Final `canceled` state is confirmed by reconciliation.
- Final cleanup is confirmed by reconciliation.

#### `autobot-next release` (deferred)

```bash
autobot-next release <issue> [--reason <text>] [--json] [--dry-run]
```

Deferred from MVP. Future command may mark an item released only when external publication already exists or release policy says no publish step is required.

Semantics:

- Refuses to release in-progress work unless it is awaiting a future release approval or reconciliation proves terminal success.
- Records who/what released it and why.
- Does not push branches or create PRs directly. That belongs to workflow phase nodes unless a future `autobot-next publish` command is introduced.

#### `autobot-next reconcile`

```bash
autobot-next reconcile [issue|--all] [--json] [--dry-run]
```

Repairs or reports mismatches between Autobot store, FlowCraft history, worker processes, worktrees, Linear, GitHub, and CI.

Semantics:

- With no target, refuses and suggests `--all` to avoid accidental broad mutation.
- `--dry-run` reports proposed fixes.
- Reconciliation never deletes history.
- Emits one event per detected mismatch and one event per applied repair.

#### `autobot-next resume` (deferred)

```bash
autobot-next resume <issue|run-id> --action <action> [--payload <path>] [--node <node-id>] [--json] [--dry-run]
```

Deferred from MVP. Future command resumes an awaiting workflow from an operator decision.

Semantics:

- Intended for explicit human gates.
- Allowed actions are defined by the waiting phase. Candidate future actions: `approve`, `reject`, `retry`, `cancel`, `release`, `continue`.
- `--payload` is a JSON file with action-specific data.
- If multiple waits exist, `--node` is required.
- Records operator identity when available.

### Workflow Debug Commands

These commands are developer/operator diagnostics, not the common happy path.

#### `autobot-next workflow list`

```bash
autobot-next workflow list [--json]
```

Lists registered FlowCraft blueprints, versions, and descriptions.

#### `autobot-next workflow validate`

```bash
autobot-next workflow validate [workflow-id] [--json]
```

Runs FlowCraft analysis and linting.

#### `autobot-next workflow diagram`

```bash
autobot-next workflow diagram <workflow-id> [--format mermaid]
```

Prints a workflow graph. MVP supports Mermaid only.

#### `autobot-next inspect`

```bash
autobot-next inspect <run-id|flowcraft-execution-id> [--json]
```

Shows raw-ish execution timeline, FlowCraft node events, context summary, and mapped domain events.

## Hidden/Internal Commands

The old `claim`, `prepare`, `run start`, and `run finish` command concepts should not be public top-level commands. If needed for worker implementation, expose them as hidden commands under:

```bash
autobot-next internal claim ...
autobot-next internal run-start ...
autobot-next internal run-finish ...
```

Rules:

- Hidden commands are omitted from normal help.
- Hidden commands require `--json`.
- Hidden commands must validate worker identity or an internal token/lock where applicable.
- Human operators should use `retry`, `cancel`, or `reconcile` in MVP. Future human-gate/release workflows may add `resume` and `release`.

## Help Text Structure

Top-level `autobot-next --help` should group commands by intent:

- Queue: `add`, `remove`, `list`, `discover`.
- Observe: `status`, `logs`, `inspect`.
- Operate: `engine`, `retry`, `cancel`, `reconcile`.
- Deferred operate commands: `release`, `resume`.
- Configure: `config`.
- Debug: `workflow`.

Every mutating command help must include one example with `--dry-run`.

## Human Output Style

- Prefer concise tables for lists and summaries.
- Use explicit `Next:` lines when an operator action is expected.
- Show issue IDs first in tables.
- Show in-progress, failed, and awaiting items before queued items in aggregate status.
- Avoid raw stack traces unless `--verbose` is passed.
- Avoid implementation trivia in default output.

## MVP Command Set

The first implementation should include:

- `autobot-next add`
- `autobot-next remove`
- `autobot-next list`
- `autobot-next status`
- `autobot-next logs`
- `autobot-next discover`
- `autobot-next config list|get|set|unset`
- `autobot-next engine status|run-once|start|stop`
- `autobot-next retry`
- `autobot-next cancel`
- `autobot-next reconcile`
- `autobot-next inspect`
- `autobot-next engine debug workflow list|validate|diagram`

Defer from MVP unless the workflow prototype needs them:

- `autobot-next release`
- `autobot-next resume`
- `autobot-next engine restart`
- hidden `autobot-next internal ...` commands.

## Acceptance Criteria For Implementation

- Every command has human and JSON output tests.
- Every JSON response includes `schema_version: 1`, `ok`, `command`, and either `data` or `error`.
- Every mutating command has a `--dry-run` test where meaningful.
- `autobot-next status` aggregate shows engine state, counts, in-progress items, warnings, and next action.
- `autobot-next status <issue>` shows event history with separate queue, prepare, phase, failure, retry, and terminal rows.
- `autobot-next config list` documents all known keys, defaults, effective values, sources, and descriptions.
- `autobot-next engine run-once --dry-run` explains what would be selected without starting workers.
- Recovery command errors include actionable recovery commands.
- Default output never exposes hidden/internal lifecycle commands as the preferred path.
