# Autobot phase contract — review-correctness-security

## Load before work
- Load the `review-standards` skill before judging.
- `review-standards`

## Inputs
- committed branch diff
- `run-plan.md`
- `smoke-test-result.md`

## Responsibilities
- Read the diff and evidence before judging.
- Read the diff, the `run-plan.md`, the `smoke-test-result.md`.
- Focus on correctness, edge cases, error paths, and security.
- Report findings only; do not repair code here.
- Write `review-output.md` with correctness, safety, and security findings.

## Output
- `review-output.md`
- correctness and security findings with concrete file + line references
