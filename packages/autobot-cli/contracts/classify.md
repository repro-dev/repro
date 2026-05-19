# Autobot phase contract — classify

## Purpose
Classify the issue shape and make an explicit routing decision.

## Issue shape values
- feature | bug | tech debt | docs | infra | ui-bearing | mixed
- `feature`
- `bug`
- `tech debt`
- `docs`
- `infra`
- `ui-bearing`
- `mixed`

## Load before work
- Load `delivery-workflow` and `implementation-rigor` before classifying.
- `delivery-workflow`
- `implementation-rigor`

## Inputs
- prepared run context
- Linear issue details

## Responsibilities
- Read the prepared context and the issue description.
- Classify the issue shape and routing decision.
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
