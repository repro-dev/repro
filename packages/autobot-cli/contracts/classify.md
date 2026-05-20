# Autobot phase contract — classify

## Purpose

Classify the issue shape and make an explicit routing decision.

## Issue shapes

- Write `issue_shapes` as an array of every matching shape.
- Use any of: `feature`, `bug`, `tech debt`, `docs`, `infra`, `ui-bearing`.
- If multiple shapes apply, include them all.
- If `ui-bearing` applies, include it alongside the other matching shapes.
- Treat `issue_shapes` as the authoritative classification input for later routing.

## Shape rubric

- `feature`: adds new user-visible or operator-visible behavior.
- `bug`: fixes broken, regressed, flaky, or incorrect behavior.
- `tech debt`: improves internal structure, maintainability, tooling, or cleanup without changing intended behavior.
- `docs`: changes only documentation, instructions, plans, prompts, or non-runtime guidance.
- `infra`: changes build, CI, deployment, local services, package wiring, or runtime operations.
- `ui-bearing`: changes a user interface, visual design, interaction behavior, accessibility, or browser-visible state.
- Include every matching shape; do not force a single best category when the issue spans multiple concerns.

## Load before work

- Load `delivery-workflow` and `implementation-rigor` before classifying.
- `delivery-workflow`
- `implementation-rigor`

## Inputs

- prepared run context
- Linear issue details
- prepare readiness decision
- worktree and open PR snapshots

## Responsibilities

- Read the prepared context and the issue description.
- Classify the issue shape(s) and routing decision.
- Use `issue_shapes` as the canonical shape result.
- Confirm the prepare readiness gates have passed before setting `route: proceed`.
- Set `route: proceed` when the run is ready.
- Mark the run `ready_to_proceed` when `route: proceed`.
- Set `route: research-refine` when the run still needs evidence, scope narrowing, or artifact repair.
- Set `route: escalate` when the issue is blocked, already active elsewhere, a tracker with child issues, or still missing required specification after recoverable context handling.
- Explain the decision with concrete missing inputs or readiness signals.
- Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/classify.json` artifact; stdout and stderr are process output only.

## Output

- Inline JSON Schema-style contract.
- Emit one canonical JSON object shaped like:

```json
{
  "issue_shapes": ["feature"],
  "route": "proceed",
  "ready_to_proceed": true,
  "why": ["short reason"],
  "next": "short next step"
}
```

- Issue shapes must be a non-empty array of strings from `feature`, `bug`, `tech debt`, `docs`, `infra`, `ui-bearing`.
- route must be one of `proceed`, `research-refine`, or `escalate`.
- ready_to_proceed must be true when route is `proceed` and false otherwise.
- why must be a non-empty array of non-empty strings.
- next must be a non-empty string.
- Phase decisions come only from `classify.json`.
