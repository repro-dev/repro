## Local-only / orchestrator checks

- Refresh worktree and open-PR state before gating decisions.
- Keep planner, develop, and review delegation bounded and retry only at phase boundaries.
- Run smoke tests after each successful develop batch and record failures separately from publishability.
- Inspect rendered prompts and fragments manually when the command wiring changes.
- Capture local browser or visual evidence only for UI-bearing work.

## CI-enforced checks

- Duplicate migration timestamp check.
- Test file size check.
- Tooling config regression test.
- `moon ci :build :typecheck :test`.
- Workspace lint.
- Prettier format check.
- Conditional container / deploy jobs.

`/deliver` publishes PRs after local verification and does **not** wait on CI. A run is not complete until the PR exists and the publish phase has run. Report local checks separately so CI status is never implied unless it was actually observed elsewhere.
