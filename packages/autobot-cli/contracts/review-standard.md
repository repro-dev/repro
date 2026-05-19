# Autobot phase contract — review-standard

## Load before work
- Load `review-standards` before judging.
- `review-standards`
- `audit-ui-quality` when the issue is UI-bearing

## Inputs
- committed branch diff
- `run-plan.md`
- `smoke-test-result.md`

## Responsibilities
- Read the diff and the evidence before judging.
- Read the diff, the `run-plan.md`, the `smoke-test-result.md`.
- Check requirements coverage, correctness, tests, conventions, and merge-readiness.
- Report findings only; do not repair code here.
- Write `review-output.md`.
- correctness, clarity, and merge-readiness findings.

## Output
- `review-output.md`
- blocker and non-blocker findings with concrete file + line references
