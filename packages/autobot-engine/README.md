# @repro/autobot-engine

TypeScript engine core for autobot task planning.

## Architecture
- The shell layer keeps the public `autobot-engine` command surface and process supervision.
- Python shims normalize legacy payloads and bridge into this package.
- This package owns task-state normalization, tracked-task ordering, transition policy, and typed effect requests/results.
- `select-work` honors the `allow_recovery` compatibility flag so `--no-recovery` remains stable.
- Recovery decisions are expressed with canonical camelCase fields internally, even when the shell bridge still sends legacy snake_case input.
- Effect execution is logged as typed outcome records and failures propagate instead of being swallowed.

### Task model
- Normalized task states: `queued`, `claimed`, `running`, `reconciling`, `failed`, `error`, `stale`, `released`, `canceled`.
- Task ordering is deterministic: lowest state rank first, then issue id, then original queue position.

### Transition contract
- Input: task + observation + config.
- Output: `{ taskId, currentState, nextState, reason, effects }`.
- Decisions stay pure; they do not touch Linear, GitHub, git, or opencode.

### Effect contract
- Requests are typed records (`prepare`, `process-work`, `recover`, `noop`).
- Results are typed records with an explicit outcome so the shell can log success, failure, or skip.
- The shell runner executes every requested effect and reports failures immediately.

## Flow
1. Load queue/state payloads.
2. Iterate tracked tasks in deterministic order.
3. Observe each task and compute a pure transition decision.
4. Emit typed effect requests, then let the shell bridge execute and record each effect outcome.

## Shell branch map
- queued branch → `prepare` effect in TS, executed by shell.
- claimed branch → `process-work` effect in TS, executed by shell.
- running/reconciling/failed/error/stale branches → `recover` transition in TS, with shell effect execution for release/reconcile/retry/cancel/continue outcomes.
- terminal branches → `noop`/terminal result recorded for observer visibility.
