# Autobot phase contract — prepare

## Load before work
- Load `delivery-workflow`, `implementation-rigor`, and `test-plan` before any other work.
- `delivery-workflow`
- `implementation-rigor`
- `test-plan`

## Inputs
- Linear issue via `linear issue show <issue-id> --json`
- current run state and worktree path
- existing `context.md`, `test-plan.md`, and any prior planning artifacts

## Responsibilities
- Read the queued issue and confirm the worktree-scoped paths.
- Write or refresh the run context artifacts before planning starts.
- Surface missing context, missing test-plan coverage, and scope drift early.
- Keep this phase read-only with respect to source code.

## Output
- `context.md`
- `test-plan.md` when needed
- a short prepare summary with known risks and next routing step

## Exit rules
- If the issue still needs research or narrower scope, route to `research-refine`.
- Otherwise hand off to `classify` and `plan`.
