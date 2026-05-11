# @repro/autobot-engine

TypeScript engine core for autobot task planning.

## Architecture
- The shell layer keeps the public `autobot-engine` command surface and process supervision.
- Python shims normalize legacy payloads and bridge into this package.
- This package owns task-state normalization, tracked-task ordering, transition policy, and typed effect requests/results.
- `select-work` honors the `allow_recovery` compatibility flag so `--no-recovery` remains stable.
- Recovery decisions are expressed with canonical camelCase fields internally, even when the shell bridge still sends legacy snake_case input.
- Effect execution is logged as typed outcome records and failures propagate instead of being swallowed.

## Flow
1. Load queue/state payloads.
2. Iterate tracked tasks in deterministic order.
3. Observe each task and compute a pure transition decision.
4. Emit typed effect requests, then let the shell bridge execute and record each effect outcome.
