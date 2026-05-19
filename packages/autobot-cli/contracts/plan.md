# Autobot phase contract — plan

## Load before work
- Load `delivery-workflow`, `implementation-rigor`, `test-plan`, and any relevant domain skill(s) before planning.
- `delivery-workflow`
- `implementation-rigor`
- `test-plan`
- any relevant domain skill(s)
- `audit-ui-quality` and the design skills when the issue is UI-bearing

## Inputs
- Linear issue via `linear issue show <issue-id> --json`
- `context.md`
- `test-plan.md`
- `research-refine.md` when present

## Responsibilities
- Read the issue and acceptance criteria first.
- Confirm the required context and test-plan artifacts exist and are current.
- Fetch the Linear issue with `linear issue show <issue-id> --json`.
- Read `context.md`.
- Read `test-plan.md`.
- If readiness is missing, route back to `research-refine` instead of forcing a plan.
- Produce the authoritative `run-plan.md`.
- Write the authoritative `run-plan.md`.
- Preserve these headings exactly:
  - `## Readiness`
  - `## Sequence Notes`
  - `## Risk Notes`
  - `## Plan`
  - `## Open Questions` only when not ready
- Add `## Open Questions` only when unresolved blockers remain.
- List every file to write or modify.
- list every file this plan will write or modify.
- Note any shared files that could conflict with sibling work.
- Include the exact artifact paths the downstream phases will consume.
- route to `research-refine` when readiness is not met.

## Output
- `run-plan.md`
- concise note about why the issue is ready or what blocks readiness
