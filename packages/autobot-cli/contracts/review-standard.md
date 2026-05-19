# Autobot phase contract — review-standard

## Load before work
- Load `review-standards` before judging.
- `review-standards`
- `audit-ui-quality` when the issue is UI-bearing

## Inputs
- committed branch diff
- `run-plan.md`
- `risk-assessment.md`
- `smoke-test-result.md`
- Linear issue via `linear issue show <issue-id> --json`

## Responsibilities
- Read the diff and the evidence before judging.
- Read the diff, the `run-plan.md`, the `risk-assessment.md`, the `smoke-test-result.md`.
- Fetch the Linear issue before reviewing.
- Review the committed branch diff with `git diff main...HEAD`.
- Check requirements coverage, correctness, tests, conventions, and merge-readiness.
- If smoke tests failed, classify each failure as `caused-by-this-change` or `pre-existing`.
- Treat `caused-by-this-change` failures as blocking correctness findings.
- Return the structured output required by `.opencode/agents/review.md`.
- Assign each finding `role: standard`.
- Report findings only; do not repair code here.
- Write the durable `review-standard.md` artifact at the supplied path; stdout is process output only.
- correctness, clarity, and merge-readiness findings.

## Output
- `review-standard.md`
- blocker and non-blocker findings with concrete file + line references
- structured findings with `severity`, `category`, `fixable_by_agent`, and `role`
