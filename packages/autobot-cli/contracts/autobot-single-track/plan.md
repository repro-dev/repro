# Autobot single-track plan contract

## Inputs

- Read `context.md`, `test-plan.md`, the tracked single-track phase contracts, and any current issue notes.

## Readiness

- Confirm the issue is single-track and ready for one issue at a time.
- Confirm the required context, test plan, and prior artifacts are present.

## Sequence Notes

- Plan the next single-issue phase only.
- Keep the run linear and bounded.
- If planning returns `needs_research`, `not_ready`, or a mechanical QC failure, route to `research-refine.md` before another planning pass.

## Risk Notes

- Call out missing context, ambiguous acceptance criteria, and fragile integration points.
- Highlight any recovery or verification risks that could block implementation.

## Plan

- Write the authoritative `run-plan.md` for this issue.
- Name the artifacts to write, the files to touch, and the verification steps.

## Open Questions

- Add `## Open Questions` only when unresolved blockers remain; omit it when the plan is already closed.

## Constraints

- Keep the flow single-track per issue.
