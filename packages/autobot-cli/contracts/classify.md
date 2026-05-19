# Autobot phase contract — classify

## Purpose
Classify the issue shape and make an explicit routing decision.

## Issue shapes
- Write `issue_shapes` as an array of every matching shape.
- Use any of: `feature`, `bug`, `tech debt`, `docs`, `infra`, `ui-bearing`.
- If multiple shapes apply, include them all.
- If `ui-bearing` applies, include it alongside the other matching shapes.
- Treat `issue_shapes` as the authoritative classification input for later routing.

## Load before work
- Load `delivery-workflow` and `implementation-rigor` before classifying.
- `delivery-workflow`
- `implementation-rigor`

## Inputs
- prepared run context
- Linear issue details

## Responsibilities
- Read the prepared context and the issue description.
- Classify the issue shape(s) and routing decision.
- Use `issue_shapes` as the canonical shape result.
- Set `route: proceed` when the run is ready.
- Mark the run `ready to proceed` when `route: proceed`.
- Set `route: research-refine` when the run still needs evidence, scope narrowing, or artifact repair.
- Explain the decision with concrete missing inputs or readiness signals.

## Output
- `## Issue Shape`
- `## Route`
- `## Readiness`
- `## Why`
- `## Next`
