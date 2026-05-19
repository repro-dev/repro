# Autobot phase contract — review-ui-quality

## Load before work
- Load the `review-standards` skill and `audit-ui-quality` before judging.
- `review-standards`
- `audit-ui-quality`

## Inputs
- committed branch diff
- `run-plan.md`
- `smoke-test-result.md`

## Responsibilities
- Read the diff and evidence before judging.
- Read the diff, the `run-plan.md`, the `smoke-test-result.md`.
- Focus on authored polish, generic drift, and clarity.
- Report findings only; do not repair code here.
- Write `review-output.md` with clarity, polish, and authored-vs-generic quality findings.

## Output
- `review-output.md`
- UI-quality findings with concrete file + line references
