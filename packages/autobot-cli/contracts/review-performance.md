# Autobot phase contract — review-performance

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
- Focus on latency, cost, unnecessary churn, and avoidable complexity.
- Report findings only; do not repair code here.
- Write `review-output.md` with latency, cost, and unnecessary churn findings.

## Output
- `review-output.md`
- performance findings with concrete file + line references
