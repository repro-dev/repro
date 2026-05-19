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
- Write the refined research notes or plan deltas.

## Output
- refined research notes or plan deltas
- explicit blocker list
- whether the next step is `plan` or another `research-refine` pass
