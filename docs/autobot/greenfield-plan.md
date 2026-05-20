# Autobot FlowCraft Greenfield Plan

## Purpose

This document summarizes the current `autobot-next` intent from the repo docs and plans a greenfield delivery using [FlowCraft](https://flowcraft.js.org). It intentionally does not integrate with, preserve, or incrementally refactor the existing implementation. Existing docs are used only to extract product and architectural requirements. Frontloaded implementation decisions live in `decisions.md`.

## Source Documents Reviewed

- `packages/autobot-cli/README.md` — current public CLI architecture, explicit task states, pure transition contract, and typed effect contract.
- `docs/autobot/cli-design.md` — public and internal `autobot-next` CLI contract.
- `docs/autobot/decisions.md` — implementation decisions that bound the greenfield surface.
- `tmp/context-REP-1143.md` and `tmp/test-plan-REP-1143.md` — explicit lifecycle-state correction and end-to-end expectations.
- `tmp/context-REP-1109.md` — shift from broad `running` lifecycle to first-class `preparing`.
- `tmp/context-REP-1110.md` — repo-scoped config surface and `.autobot/` state directory expectation.
- `tmp/context-autobot-status-events.md` — status history and event visibility goals.
- `tmp/context-autobot-next-workers.md` — supervisor tick should schedule detached side-effect workers instead of blocking inline.
- `tmp/debug-autobot-next-logging.md` — supervisor logs must report meaningful loop and processing activity.
- `tmp/context-autonomous-opencode-orchestration.md` — broader monitor/runner principles: deterministic infrastructure, per-issue workspace isolation, durable artifacts, operator visibility, Linear as source of truth, GitHub/CI as validation truth.

## Current High-Level Goals

- Provide a repo-owned automation queue for Linear work items that can be operated locally from the main checkout.
- Separate public queue language from internal claim/run implementation details.
- Maintain durable local state under `.autobot/`, including queued items, active runs, retry metadata, config, logs, and event history.
- Let a standalone supervisor claim queued work, prepare isolated workspaces, run delivery phases, reconcile outcomes, retry failed work, and complete or cancel terminal work.
- Make lifecycle boundaries explicit so operators and automation can see where work actually is: `queued`, `claimed`, `preparing`, `planning`, `developing`, `testing`, `reviewing`, `reconciling`, `awaiting`, `failed`, `completed`, and `canceled`.
- Keep transition decisions deterministic and auditable. The current supervisor README frames decisions as pure: input task plus observation plus config yields current state, next state, reason, and typed effects.
- Keep side effects typed and observable. MVP effect requests include `claim`, `prepare-worktree`, `process-work`, `plan`, `develop`, `test`, `review`, `reconcile`, `recover`, and `noop`; future release/publish effects can be added after release semantics are defined. Effect outcomes should record success, failure, or skip.
- Support parallel-first supervisor operation through queue depth and max concurrency controls, without implying only one selected work item exists.
- Surface useful status and history to humans, including queueing, preparing, each delivery phase, processing activity, and failures.
- Preserve operator controls for discovery, queue management, config, logs, retry, cancel, and reconcile. Manual release is post-MVP.

## Current Architecture Summary

### Actors

- User/operator: discovers work, queues or removes items, inspects state, adjusts config, reviews logs, cancels work, retries failed work, and reconciles ambiguous state.
- Bot-mode intake: discovers Linear candidates and queues/claims work up to policy, queue depth, and concurrency limits.
- Delivery daemon: operates on queued or claimed work and shepherds it through prepare, phase execution, recovery, reconciliation, completion, and cancellation.
- OpenCode session workers: bounded execution units inside isolated workspaces. They should receive durable instructions/artifacts and not rely on conversation continuity.

### State Model

- Public item lifecycle: queue-oriented language for operators.
- Internal lifecycle: explicit phase names, not broad `running` buckets.
- Durable state root: `.autobot/` in the repo/workspace.
- Required state categories: queue items, claims, active run attempts, per-phase events, retry metadata, terminal state, config, supervisor logs, and per-run artifacts.

### Supervisor Model

- The supervisor is a long-running local daemon or foreground loop.
- Each tick observes current durable state, selects eligible work deterministically, emits side-effect requests, and records outcomes.
- The current desired direction separates pure transition policy from effect execution.
- Worker delegation should keep the supervisor tick non-blocking. Long-running worktree preparation or delivery should run in detached workers or distributed jobs, while the supervisor continues scheduling and observing.
- Recovery is first-class rather than hidden in generic failure handling.

### Event And Observability Model

- `autobot-next status` should not only show final summaries; it should show queue, prepare, and delivery-phase history.
- Supervisor logs should show actual processing activity, failures, and idle/scanning states, not only heartbeat/liveness.
- Event records should be durable and mergeable across queue lifecycle and per-run phase execution.

## Current User-Facing CLI Surface

### `autobot-next`

Public queue interface from `docs/autobot/cli-design.md`:

- `autobot-next add <issue> [--json] [--dry-run]` queues an issue without creating a worktree.
- `autobot-next remove <issue> [-f] [--json] [--dry-run]` removes a queued item and restores Linear assignment/state where possible.
- `autobot-next list [--json]` shows non-terminal queued items.
- `autobot-next status [issue] [--json]` shows aggregate queue state or per-item detail/history.
- `autobot-next logs [issue] [-t] [--json]` inspects supervisor or issue logs.
- `autobot-next discover [--limit N] [--project name] [-q] [--json]` discovers candidate work and prints metadata by default, or identifiers with `-q`.
- `autobot-next config get <key> [--json]` reads a repo-scoped setting.
- `autobot-next config set <key> <value> [--json]` persists a repo-scoped setting.
- `autobot-next config unset <key> [--json]` removes a repo-scoped setting override.
- `autobot-next config list [--json]` is referenced in examples and prior context as the discoverability surface for config keys.
- `autobot-next supervisor debug workflow list|validate|diagram [--json]` keeps FlowCraft inspection available without advertising a top-level workflow group.

Public JSON responses are versioned with `schema_version: 1`. Public status-oriented responses include a `config` block sourced from `.autobot/config.json`. Current config keys are `engine.auto-discover`, `engine.queue-depth`, and `engine.max-concurrency`.

### Internal lifecycle surface

Internal/provisional lifecycle surface is captured in `docs/autobot/cli-design.md` and should remain hidden or explicitly debug-only.

## FlowCraft Capability Assessment

### Strong Fits

- Workflow as data: FlowCraft blueprints are JSON-serializable DAGs with nodes and edges. This maps well to auditable delivery plans and versioned phase workflows.
- Typed node contracts: FlowCraft node functions/classes and typed context fit the need for explicit task, run, effect, and observation records.
- Pure orchestration plus side-effect nodes: Autobot's current transition/effect split can become workflow graph control plus isolated node implementations.
- Durable pauses: FlowCraft wait/sleep nodes and durable primitives fit human intervention, retry backoff, reconciliation delays, and approval gates.
- Error handling: built-in retries, fallbacks, fatal/non-fatal errors, and class-based `recover()` map well to delivery retries and cleanup.
- Parallelism: batch/scatter-gather and runtime concurrency controls can express queue depth and parallel work item execution.
- Subflows: phase workflows can be composed as reusable subflows: discover, claim, prepare, plan, develop, test, review, reconcile, recover, and future release/publish.
- Observability: FlowCraft event bus, persistent history adapters, replay, and CLI inspection align strongly with `autobot-next status`, `autobot-next logs`, and timeline requirements.
- Static analysis: blueprint linting, cycle checks, visualization, and compiler type checks support safe changes to complex orchestration.
- Distributed growth path: FlowCraft adapters let the same business node logic run in-memory first and later move to BullMQ/Redis or another queue.

### Partial Fits / Design Work Required

- Queue ownership: FlowCraft executes workflows, but Autobot still needs a domain queue of Linear issues, policy filters, claims, and operator-visible item state. This should be modeled as an Autobot store, not delegated entirely to FlowCraft.
- State projection: FlowCraft context/history are execution-centric. Autobot needs item-centric projections for `list`, `status`, and queue controls. Build a projection layer from workflow events plus item records.
- CLI surface: FlowCraft's CLI inspects workflow execution history, but it does not replace the product CLI. The Autobot CLI should wrap FlowCraft state/history with domain language.
- External tools: OpenCode sessions, Linear, GitHub, git worktrees, and CI are side effects requiring strong adapters, idempotency keys, lock handling, timeout behavior, and careful process supervision.
- Deterministic selection: FlowCraft can execute selected workflows, but candidate selection, fairness, priority, concurrency limits, and duplicate suppression need Autobot-owned scheduling policy.
- Local-first durability: FlowCraft has SQLite history, but workflow state, queue items, claim leases, and worker heartbeats still need a first-class schema.
- Long-running process management: FlowCraft can run in-memory or distributed, but daemon lifecycle commands such as `start`, `stop`, `status`, and process supervision remain Autobot responsibilities.

### Risks / Gaps

- DAG versus lifecycle loops: Delivery orchestration includes retry/recover/reconcile loops. FlowCraft supports loops and sleep/wait, but the core delivery graph must be carefully bounded to avoid unclear cycles and runaway automation.
- Idempotency is not optional: Each side-effect node must be restart-safe. FlowCraft can retry nodes, but Autobot must define idempotency for Linear mutations, git worktree creation, OpenCode launches, branch pushes, PR creation, and cleanup.
- Human intervention semantics need a product layer: FlowCraft wait nodes can pause, but Autobot must expose who can resume, what choices are allowed, how decisions are audited, and how stale waits are escalated.
- Multiple executions per issue: One Linear issue may have several attempts, retries, or resumed runs. The data model must distinguish item ID, run ID, attempt number, FlowCraft execution ID, worker ID, and workspace path.
- Worker cancellation: FlowCraft supports `AbortSignal`, but spawned OpenCode sessions and shell processes need reliable cancellation and cleanup outside the runtime.
- FlowCraft maturity: Its docs show rich capabilities, but before committing to production architecture, validate package stability, adapter behavior, history adapters, compiler limitations, and APIs against real usage.

## Greenfield Target Architecture

### Package Shape

- `packages/autobot-core` — domain types, config schema, queue policy, state projection, command result types.
- `packages/autobot-store` — local durable state abstraction and SQLite implementation rooted at `.autobot/autobot.sqlite`.
- `packages/autobot-flowcraft` — FlowCraft blueprints, node registry, subflows, runtime wiring, history integration, and event mapping.
- `packages/autobot-adapters` — side-effect adapters for Linear, git/worktrees, OpenCode sessions, tests, review, reconciliation, GitHub inspection, filesystem artifacts, and future release/publish behavior.
- `packages/autobot-cli` — public `autobot-next` command parser/renderers.

This is a greenfield decomposition; names can be adjusted, but the boundaries should remain: domain/store/workflows/effects/CLI/supervisor.

### Durable Storage

Use a local SQLite database under `.autobot/` for the MVP. Keep FlowCraft execution history in either the same SQLite file with clear table prefixes or a sibling `.autobot/flowcraft-events.sqlite` file.

Required domain tables:

- `items`: one row per Linear issue queued or seen by Autobot.
- `runs`: one row per delivery attempt, linked to item ID and FlowCraft execution ID.
- `claims`: current owner/lease/workspace/phase for active work.
- `events`: item-centric event projection for CLI history.
- `config`: repo-scoped config keys and values.
- `workers`: active worker heartbeats, PIDs, lock tokens, cancellation state.
- `artifacts`: paths to prompts, plans, test plans, logs, summaries, diffs, and PR metadata.

Recommended event approach:

- Store raw FlowCraft events through `PersistentEventBusAdapter` and SQLite history.
- Also write domain events from middleware or event consumers into `events` for fast `autobot-next status` rendering.
- Keep raw events immutable. Rebuild projections if the projection shape changes.

### Workflow Model

Use one top-level workflow per issue run: `autobot-deliver-issue`. Use subflows for phases.

Top-level workflow:

1. `load-item` — read item, run config, attempt metadata, and issue details.
2. `claim-item` — create or renew claim lease.
3. `prepare-workspace` — create/update isolated worktree and run setup checks.
4. `plan-work` — create context/test plan artifacts and decide whether implementation is allowed.
5. `develop-work` — launch bounded OpenCode develop session.
6. `test-work` — launch tests or test-agent session.
7. `review-work` — run review/security review gates as configured.
8. `reconcile-result` — inspect git/Linear/GitHub/CI and produce terminal outcome.
9. `complete-run` — mark completed, canceled, failed, or awaiting future operator action.

Future release/publish workflows can be inserted before `reconcile-result` once release semantics are defined.

Phase subflows:

- `discover-candidates` — Linear discovery and policy filtering.
- `queue-intake` — add discovered candidates up to queue depth.
- `prepare-workspace` — worktree creation, dependency sanity checks, artifact initialization.
- `agent-session` — spawn OpenCode with a phase-specific prompt and monitor events.
- `quality-gate` — run deterministic verification commands and collect results.
- `operator-review` — future wait node for approval, retry, cancel, or release decisions.
- `recovery` — classify failure, backoff, retry eligible phases, or escalate.

### Scheduling Model

Autobot should own scheduling separately from FlowCraft execution.

- The supervisor tick reads config and store state.
- It discovers/queues candidates when `engine.auto-discover` is enabled.
- It selects runnable items using deterministic ordering: priority/policy rank, lifecycle rank, issue ID, queue position, and lease age.
- It starts new FlowCraft executions until `engine.max-concurrency` is reached.
- It uses `engine.queue-depth` to cap auto-discovered queued-but-not-running work.
- It reconciles awaiting/stalled/failed executions on every tick.
- It emits domain events for tick start, work selected, worker spawned, idle, and failures.

Start with a single local daemon and in-memory FlowCraft runtime using SQLite persistence. Design the node registry and store interfaces so the execution backend can later move to BullMQ/Redis without rewriting phase nodes.

### Node Design Rules

- Every node receives typed context and returns typed output.
- Every side-effect node requires an idempotency key: `{ issueId, runId, attempt, phase, nodeId }`.
- Every external mutation must write a before/after domain event.
- Long-running nodes must check `AbortSignal` and propagate cancellation to child processes.
- Retriable nodes should declare `maxRetries` and queue/delay semantics. Non-retriable nodes should throw fatal `FlowcraftError` with recovery guidance.
- Class-based nodes should be used for side effects that require `prep`, `exec`, `post`, and `recover` boundaries.
- Pure policy functions should stay outside side-effect nodes and be unit-tested independently.

### FlowCraft Runtime Wiring

- Use `FlowRuntime` with a custom event bus that writes FlowCraft history and domain projections.
- Register node implementations through a typed registry.
- Use a custom logger to write human-readable `.autobot/engine.log` lines and structured events.
- Use middleware for idempotency guards, lease validation, event projection, and tracing.
- Use SQLite history for MVP and keep the interface open for PostgreSQL or distributed history later.
- Use `analyzeBlueprint` and `lintBlueprint` in CI and in `autobot-next workflow validate`.
- Generate Mermaid diagrams for docs and debugging.

### CLI Design

Keep the public CLI stable in spirit, but make the greenfield behavior cleaner and more consistent.

Target public commands after cutover. During phased implementation, expose these through `autobot-next` until `REP-1165` swaps the public entrypoint.

Core commands:

- `autobot-next add <issue> [--json] [--dry-run]` — validate issue, create item, emit `item.queued`.
- `autobot-next remove <issue> [-f] [--json] [--dry-run]` — remove queued item or request cancellation for in-progress item.
- `autobot-next list [--state state] [--json]` — show non-terminal items by default.
- `autobot-next status [issue] [--json] [--events]` — show aggregate queue/supervisor state or per-item timeline.
- `autobot-next logs [issue|--engine] [-t] [--json]` — tail supervisor, worker, or issue logs.
- `autobot-next discover [--limit N] [--project name] [-q] [--json]` — show candidate issue metadata; `-q` prints IDs only.
- `autobot-next config list|get|set|unset ... [--json]` — manage repo-scoped config.
- `autobot-next supervisor start|stop|status|run-once [--foreground] [--json]` — manage local daemon lifecycle. Legacy `engine` spelling remains a compatibility path; `restart` is post-MVP.
- `autobot-next retry <issue> [--reason text] [--json]` — create a new attempt from the recorded failed phase.
- `autobot-next cancel <issue> [--reason text] [--json]` — cancel in-progress or queued work.
- `autobot-next reconcile [issue|--all] [--json]` — inspect and repair mismatches between store, workers, git, Linear, and GitHub.

Developer/debug commands:

- `autobot-next supervisor debug workflow list [--json]` — list available FlowCraft blueprints and versions. Legacy `engine` spelling remains a compatibility path.
- `autobot-next supervisor debug workflow validate [workflow] [--json]` — run FlowCraft analysis/linting. Legacy `engine` spelling remains a compatibility path.
- `autobot-next supervisor debug workflow diagram <workflow>` — print Mermaid graph. Legacy `engine` spelling remains a compatibility path.
- `autobot-next inspect <run-id> [--json]` — domain wrapper around FlowCraft history inspection.

Deferred commands:

- `autobot-next resume <run-id> --node <node> --action <action> [--payload file]` — resume a paused wait node; deferred until human-gate workflows are in scope.
- `autobot-next release <issue> [--reason text] [--json]` — manual terminal release; deferred until publish/release semantics are defined.

JSON response conventions:

- All JSON responses include `schema_version: 1`.
- Status-oriented responses include `config`, `supervisor`, `items`, and `events` where applicable.
- Mutating responses include `dry_run`, `changed`, `item`, and `events`.
- Error responses include what failed, likely cause, and concrete recovery commands.

### Operator Experience

Default status should answer:

- Is the supervisor running?
- How many items are in each public state?
- What is each in-progress item doing right now?
- What worker owns it and when was it last seen?
- What is the next expected action?

Per-item status should show:

- Issue metadata and current lifecycle state.
- Workspace path and branch.
- Attempt history.
- FlowCraft run ID and blueprint version.
- Timeline rows for queue, claim, prepare, plan, develop, test, review, reconcile, waits, retries, cancellation, and terminal outcome.
- Last failure with recovery commands.
- Artifact paths.

## Delivery Plan

### Phase 0: FlowCraft Spike And Risk Burn-Down

Goals:

- Confirm FlowCraft package APIs, TypeScript support, history adapters, and runtime behavior against a real local prototype.
- Decide whether to use Fluent API, compiler, or a hybrid.

Tasks:

- Create a throwaway prototype outside existing Autobot code that defines `autobot-deliver-issue` with `claim`, `prepare`, phase execution, retry/fallback, cancellation, and reconciliation nodes.
- Persist history to SQLite using FlowCraft's SQLite history adapter.
- Prove `run`, retry, fallback, cancellation, and reconciliation behavior. Durable wait/resume can be spiked separately before human-gate workflows are added.
- Prove event bus projection into an item-centric status table.
- Run `analyzeBlueprint`, `lintBlueprint`, and Mermaid generation.
- Validate that class-based nodes can clean up child processes in `recover()`.

Exit criteria:

- A prototype can start an issue workflow, fail a phase, retry or recover, cancel safely, reconcile terminal state, and render a timeline.
- Known FlowCraft API gaps are documented with workarounds or rejection criteria.

### Phase 1: Domain Model And Store

Goals:

- Establish Autobot-owned state independent of execution backend.

Tasks:

- Define TypeScript domain types for item, lifecycle state, run, attempt, claim, worker, config, artifact, event, and command result.
- Implement SQLite schema and migrations under `.autobot/`.
- Implement repository interfaces: `ItemStore`, `RunStore`, `ClaimStore`, `ConfigStore`, `EventStore`, `WorkerStore`.
- Implement idempotent event append and projection rebuild.
- Implement config defaults for `engine.auto-discover`, `engine.queue-depth`, and `engine.max-concurrency`.
- Implement JSON response envelopes and error result shape.

Exit criteria:

- Unit tests cover state transitions, idempotency keys, config defaults/overrides, event projection, and migration from empty state.

### Phase 2: Workflow Blueprints And Node Registry

Goals:

- Express the delivery lifecycle as FlowCraft workflows without real external side effects.

Tasks:

- Define `AutobotWorkflowContext` with issue ID, item, run, attempt, config, workspace, artifacts, phase results, and recovery state.
- Build `autobot-deliver-issue` top-level blueprint.
- Build subflows for `prepare-workspace`, `agent-session`, `quality-gate`, `operator-review`, and `recovery`.
- Add mock node implementations for Linear, git, OpenCode, tests, review, reconciliation, and future release/publish seams.
- Add static validation tests for all blueprints.
- Add integration tests with FlowCraft `InMemoryEventLogger` and `runWithTrace`.

Exit criteria:

- A mocked issue can traverse the full workflow to completed, canceled, failed, or reserved awaiting states.
- Tests assert event sequence and domain projection for all major paths.

### Phase 3: Public CLI MVP

Goals:

- Build operator-facing queue and status commands against the greenfield store and mocked workflows.

Tasks:

- Implement `autobot-next add`, `remove`, `list`, `status`, `logs`, `discover`, and `config` commands.
- Implement human and JSON renderers.
- Implement `autobot-next workflow validate`, `diagram`, and `inspect` debug commands.
- Implement error messages with concrete recovery commands.
- Generate or update manpage content for the new CLI model.

Exit criteria:

- CLI can queue items, show config, list/status items, display event timelines, and validate workflows without starting the daemon.

### Phase 4: Local Supervisor Scheduler

Goals:

- Add a local supervisor that starts FlowCraft executions from queued items.

Tasks:

- Implement `autobot-next supervisor run-once` as the first scheduling primitive.
- Implement deterministic selection and max concurrency enforcement.
- Implement worker/lease rows and heartbeat updates.
- Implement `start`, `stop`, `status`, `run-once`, and foreground mode. `restart` is deferred from MVP.
- Emit supervisor events for scanning, idle, selected, started, awaiting, failed, and reconciled.
- Add cancellation handling through `AbortController` and process signals.

Exit criteria:

- The supervisor can process mocked items concurrently up to config limits, return to idle, and report useful logs/status.

### Phase 5: Real Side-Effect Adapters

Goals:

- Replace mocks with real adapters behind stable node interfaces.

Tasks:

- Linear adapter: discover candidates, fetch issue metadata, claim/assign/comment/state transitions as policy allows.
- Worktree adapter: create/update per-issue workspaces, record branch/path, validate clean/dirty state.
- OpenCode adapter: spawn phase-specific sessions with durable prompts/artifacts, stream logs, monitor exit state, support cancellation.
- Verification adapter: run configured commands and capture logs/results.
- GitHub adapter: detect pushed branch/PR/CI state. Automated PR creation/release remains out of MVP unless a later release policy explicitly enables it.
- Filesystem artifact adapter: write context/test-plan/review/release artifacts under `.autobot/runs/...` or repo `tmp/` as appropriate.

Exit criteria:

- A dry-run or sandbox issue can prepare a workspace and execute a no-op OpenCode session with full status/log projection.

### Phase 6: Recovery, Reconcile, And Human Gates

Goals:

- Make failure modes explicit and recoverable.

Tasks:

- Implement failure classifier: transient, policy-blocked, needs-human, dirty-worktree, external-service, validation-failed, fatal.
- Implement retry with backoff using FlowCraft sleep nodes or queue-delayed retries.
- Implement wait nodes for operator approval, risky action, conflicting state, or release decision after MVP.
- Implement post-MVP `autobot-next resume` and `autobot-next release` against FlowCraft execution state and domain store. MVP recovery includes `retry`, `cancel`, and `reconcile`.
- Implement stale worker detection and lease recovery.

Exit criteria:

- Failed, awaiting, canceled, retried, and reconciled runs produce correct status and do not corrupt claims or duplicate side effects.

### Phase 7: Observability And Debugging

Goals:

- Make Autobot explain itself well enough for daily use.

Tasks:

- Persist raw FlowCraft events and domain projections.
- Add `autobot-next inspect <run-id>` using FlowCraft history plus domain context.
- Add `autobot-next logs -t` for supervisor and issue logs.
- Add timeline compaction for long runs.
- Add Mermaid graph output for current workflow versions.
- Optionally add OpenTelemetry middleware for node spans.

Exit criteria:

- Operators can diagnose a failed or stuck issue from CLI output without reading raw database rows.

### Phase 8: Distributed Execution Option

Goals:

- Prepare for scaling beyond one local daemon without changing node logic.

Tasks:

- Abstract runtime backend: local in-memory versus distributed adapter.
- Evaluate BullMQ/Redis adapter for local multi-worker scaling.
- Move retry backoff to queue mode if supported.
- Validate distributed locks, joins, poison/cancellation pill behavior, and workflow version compatibility.
- Add deployment docs for worker processes and Redis requirements.

Exit criteria:

- The same mocked workflows run through distributed execution with equivalent event projection and status.

## Testing Strategy

- Unit-test domain transition policy and scheduling selection independently from FlowCraft.
- Unit-test each node with mocked dependencies and idempotency records.
- Integration-test blueprints using FlowCraft `InMemoryEventLogger` and `runWithTrace`.
- Snapshot-test CLI human renderers for list/status/logs/config.
- Contract-test JSON response envelopes and error recovery commands.
- Fault-injection-test external adapters: Linear unavailable, git conflict, OpenCode crash, test failure, PR creation failure, worker killed, stale lease, duplicate retry.
- Reconciliation-test persisted state by killing the process mid-run and resuming from SQLite history/context.
- Static-test blueprints in CI with FlowCraft analysis/linting and graph generation.

## Recommended Initial MVP Boundary

Build the first greenfield slice as local-only and observe/prepare-oriented:

- Store and CLI are real.
- FlowCraft runtime and history are real.
- Discovery can be real or fixture-backed.
- Worktree preparation can be real behind dry-run controls.
- OpenCode implementation sessions are mocked or no-op.
- Release/PR creation is out of scope. Successful MVP terminal state is `completed`.

This validates the highest-risk architectural choice: using FlowCraft as the durable orchestration runtime while Autobot owns domain queue, operator UX, and side-effect contracts.

## Fit Verdict

FlowCraft is a strong architectural fit for the Autobot engine core if it is used as the workflow runtime, not as the whole product. Its DAG blueprints, typed context, retries/fallbacks, durable waits/sleeps, subflows, event bus, history adapters, replay, static analysis, and distributed adapter path directly address Autobot's need for explicit lifecycle orchestration and observable long-running delivery runs.

The main work remains Autobot-specific: issue queue semantics, local durable store, scheduler policy, CLI, idempotent side-effect adapters, process supervision, and operator recovery controls. If those are treated as first-class product layers around FlowCraft, FlowCraft can remove a large amount of bespoke state-machine and event-history machinery while making the delivery lifecycle easier to analyze, test, and evolve.
