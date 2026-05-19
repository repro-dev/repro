# Autobot phase contract — review-ui-quality

## Load before work
- Load the `review-standards` skill and `audit-ui-quality` before judging.
- `review-standards`
- `audit-ui-quality`

## Inputs
- committed branch diff
- `run-plan.md`
- `smoke-test-result.md`
- Linear issue via `linear issue show <issue-id> --json`
- `context.md` with UI direction or handoff blocks when present

## Responsibilities
- Read the diff and evidence before judging.
- Read the diff, the `run-plan.md`, the `smoke-test-result.md`.
- Fetch the Linear issue before reviewing.
- Review the committed branch diff with `git diff main...HEAD`.
- Read `## Targeted Design Edit`, `## Design Direction`, and `## Design Handoff Context` when present.
- Focus on authored polish, generic drift, and clarity.
- Evaluate authored polish separately from design-system compliance.
- Require concrete fix hints for any drift.
- If smoke tests failed, classify each failure as `caused-by-this-change` or `pre-existing`.
- Treat low-authored-polish output as blocker or major when it undermines ship readiness.
- Return the structured output required by `.opencode/agents/review.md`.
- Assign each finding `role: ui-quality`.
- Report findings only; do not repair code here.
- Write `review-output.md` with clarity, polish, and authored-vs-generic quality findings.

## Output
- `review-output.md`
- UI-quality findings with concrete file + line references
- structured findings with `severity`, `category`, `fixable_by_agent`, and `role`
