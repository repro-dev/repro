# Autobot phase contract — develop

## Load before work
- Load `implementation-rigor` before coding.
- `implementation-rigor`
- any relevant domain skill(s)
- `design-system`, `design-edit`, `design-direction`, or `design-handoff` when the issue is UI-bearing

## Inputs
- approved `run-plan.md`
- `context.md`
- `test-plan.md`
- classify output, including `issue_shapes`

## Responsibilities
- Read the approved `run-plan.md`.
- Verify the worktree exists and the current branch matches the issue branch before editing.
- Read `context.md` and `test-plan.md` before coding.
- Do not re-explore from scratch unless the plan explicitly calls for it.
- Write the smallest safe code diff.
- Write matching test updates in the same change.
- Do not push or create a PR.
- Write temporary output only under the worktree-local `tmp/` directory.
- If the plan has a strategic mismatch with the codebase or issue, stop and report the mismatch instead of improvising broader scope.
- Keep verification separate; do not perform smoke tests in this phase.
- Preserve any UI context boundary or design-handoff notes when present.
- For UI-bearing work, run an authored-polish self-critique before handoff and include browser evidence expectations when the plan calls for browser-visible behavior.
- Log implementation friction to `tmp/friction.md` with `Phase: implementation` and a root cause of `missing-docs`, `unclear-pattern`, `tooling-gap`, or `stale-code`.

## Output
- code changes
- matching tests
- `.autobot/runs/<issue-id>/attempt-<attempt>/implementation-summary.md`
