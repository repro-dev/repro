# @repro/autobot-engine

TypeScript engine core for autobot task planning.

## Architecture
- This package is the canonical source of truth for task-state normalization,
  tracked-task ordering, transition policy, and typed effect requests/results.
- `packages/autobot-cli` owns command parsing, flag forwarding, and process
  orchestration.
- The shell/Python layers remain compatibility shims for legacy callers.
- `select-work` honors the `allow_recovery` compatibility flag so
  `--no-recovery` remains stable.
- Recovery decisions are expressed with canonical camelCase fields internally,
  even when compatibility input still uses legacy snake_case.
- Effect execution is logged as typed outcome records and failures propagate
  instead of being swallowed.

### Task model
- Current phases: `claim`, `prepare-worktree`, `prepare-context`, `plan`,
  `develop`, `test`, `review`, `release`, `recover`, `noop`.
- Normalized task states: `queued`, `claimed`, `preparing`, `planning`,
  `developing`, `testing`, `reviewing`, `releasing`, `running`,
  `reconciling`, `failed`, `error`, `stale`, `released`, `canceled`.
- Task ordering is deterministic: lowest state rank first, then issue id, then
  original queue position.

### Transition contract
- Input: task + observation + config.
- Output: `{ taskId, currentState, nextState, reason, effects }`.
- Decisions stay pure; they do not touch Linear, GitHub, git, or opencode.

### Effect contract
- Requests are typed records (`claim`, `prepare-worktree`, `prepare-context`,
  `plan`, `develop`, `test`, `review`, `release`, `recover`, `noop`).
- Results are typed records with an explicit outcome so the shell can log
  success, failure, or skip.
- The shell runner executes every requested effect and reports failures
  immediately.

## Flow
1. Load queue/state payloads.
2. Iterate tracked tasks in deterministic order.
3. Observe each task and compute a pure transition decision.
4. Emit typed effect requests, then let the shell bridge execute and record each
   effect outcome.

## Transitional notes
- Legacy queue payloads can still be recovered from `claims` / `runs` tables via
  the CLI migration path.
- The daemon entrypoint still uses the TS CLI wrapper; no Restate dependency is
  introduced.

## Final shape
- The engine loop stays explicit and phase-driven.
- `noop` records terminal visibility without mutating work.

## Shell branch map
- queued branch → `prepare` effect in TS, executed by shell.
- claimed branch → `process-work` effect in TS, executed by shell.
- running/reconciling/failed/error/stale branches → `recover` transition in TS, with shell effect execution for release/reconcile/retry/cancel/continue outcomes.
- terminal branches → `noop`/terminal result recorded for observer visibility.
