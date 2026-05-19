# Autobot phase contract — plan

## Load before work
- Load `delivery-workflow`, `implementation-rigor`, `test-plan`, and any relevant domain skill(s) before planning.
- `delivery-workflow`
- `implementation-rigor`
- `test-plan`
- any relevant domain skill(s)
- `audit-ui-quality` and the design skills when the issue is UI-bearing
- Load `linear-cli` before fetching issue details.

## Inputs
- Linear issue via `linear issue show <issue-id> --json`
- `context.md`
- `test-plan.md`
- `research-refine.md` when present
- `classify` output, including `issue_shapes`
- prior investigation notes and resolved blocker PR references when present

## Responsibilities
- Read the issue and acceptance criteria first.
- Confirm the required context and test-plan artifacts exist and are current.
- Fetch the Linear issue with `linear issue show <issue-id> --json`.
- Read `context.md`.
- Read `test-plan.md`.
- Read `issue_shapes` from classify output and use them to select relevant domain skills.
- When UI context is required, require `## Design Direction`, `## Targeted Design Edit`, or `## Design Handoff Context` in `context.md` before planning.
- Include prior investigation findings and resolved blocker PR references when provided.
- Explore code only as needed to identify affected files and patterns.
- Do not write source files.
- Do not write files except the authorized plan artifact and friction log.
- Log planning friction to `tmp/friction.md` with `Phase: planning` and a root cause of `missing-docs`, `unclear-pattern`, `tooling-gap`, or `stale-code`.
- If readiness is missing, route back to `research-refine` instead of forcing a plan.
- Write the authoritative `run-plan.md`.
- Preserve these headings exactly:
  - `## Readiness`
  - `## Sequence Notes`
  - `## Risk Notes`
  - `## Plan`
  - `## Open Questions` only when not ready
- Add `## Open Questions` only when unresolved blockers remain.
- List every file this plan will write or modify.
- For shared or high-risk files within this issue, specify the exact edit location or section.
- Include the exact artifact paths the downstream phases will consume.
- route to `research-refine` when readiness is not met.

## Planner QC
- If schema or database signals appear, include a migration step or explain in `## Risk Notes` why no migration is required.
- If the plan lists more than 15 files or identifies a large diff, add a visible large-diff note in `## Risk Notes`.
- If the plan is not ready after recoverable context handling, record the blocker and route to `research-refine` or escalation instead of producing an implementation plan.

## Output
- `run-plan.md`
- concise note about why the issue is ready or what blocks readiness
