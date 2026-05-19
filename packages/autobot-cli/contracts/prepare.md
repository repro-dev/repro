# Autobot phase contract — prepare

## Load before work
- Load `delivery-workflow`, `implementation-rigor`, and `test-plan` before any other work.
- `delivery-workflow`
- `implementation-rigor`
- `test-plan`
- Load `linear-cli` before any Linear read or mutation.

## Inputs
- Linear issue via `linear issue show <issue-id> --json`
- child issue list via `linear issue children <issue-id> --json`
- blocker issue details for every `relations.blockedBy` entry
- active worktree snapshot from `reproctl wt list --json`
- open pull request snapshot from `gh pr list --state open --limit 1000 --json number,headRefName,title`
- current run state and worktree path
- existing `context.md`, `test-plan.md`, and any prior planning artifacts

## Readiness gates
- Stop before planning when the target has child issues; route to human/spec escalation with a note to select a concrete child issue.
- Stop before planning when any blocker is not `Done` or `Canceled`.
- Stop before planning when the issue is already `Done`, `Canceled`, `In Progress`, or `In Review`.
- Stop before planning when the issue already has an active worktree or appears in an open PR branch.
- If UI context is the only missing prerequisite, run the matching design workflow, refresh `context.md`, and re-evaluate readiness before escalating.
- If the issue still lacks enough concrete scope for bounded planning, add `needs-spec`, set the issue back to `Todo`, and record the missing information.

## Responsibilities
- Read the queued issue and confirm the worktree-scoped paths.
- Write or refresh the run context artifacts before planning starts.
- Surface missing context, missing test-plan coverage, and scope drift early.
- Keep this phase read-only with respect to source code.
- Do not create or modify source files.
- Write temporary and issue-scoped artifacts only under the selected worktree's `tmp/` directory.

## Output
- `context.md`
- `test-plan.md` when needed
- a short prepare summary with known risks and next routing step
- readiness decision: `proceed`, `research-refine`, or `escalate`

## Exit rules
- If the issue still needs research or narrower scope, route to `research-refine`.
- Otherwise hand off to `classify` and `plan`.
