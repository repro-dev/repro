# Autobot phase contract — review-architecture-conventions

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
- Focus on architecture fit, package conventions, import boundaries, and style drift.
- Report findings only; do not repair code here.
- Write `review-output.md` with architectural-fit and convention-drift findings.

## Output
- `review-output.md`
- architecture and conventions findings with concrete file + line references
