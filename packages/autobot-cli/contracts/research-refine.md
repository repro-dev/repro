# Autobot phase contract — research-refine

## Purpose
Turn uncertainty into the smallest useful research or plan delta.

## Load before work
- Load `delivery-workflow` and the relevant domain skill(s) before researching.
- `delivery-workflow`
- the relevant domain skill(s)
- `test-plan` when behavior or contract gaps affect coverage

## Inputs
- latest `run-plan.md` if one exists
- `context.md` and `test-plan.md`
- any mechanical QC or review failure notes

## Responsibilities
- Gather only the missing evidence needed to unblock planning.
- Read the latest `run-plan.md`.
- Convert `needs_research`, `not_ready`, or mechanical QC failures into actionable deltas.
- Keep scope narrow and prefer the smallest change that restores readiness.
- Do not widen the issue beyond the current run.
- Preserve the original issue boundary; do not invent new product scope.
- If the missing input is UI direction, capture the required design context block before returning to planning.
- If the issue still cannot be made bounded, return an escalation reason instead of forcing a plan.
- Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/research-refine.md` artifact; stdout is process output only.
- Write the refined research notes or plan deltas.

## Output
- `.autobot/runs/<issue-id>/attempt-<attempt>/research-refine.md`
- refined research notes or plan deltas
- explicit blocker list
- whether the next step is `plan` or another `research-refine` pass
- escalation reason when the issue still needs human specification
