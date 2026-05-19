# Autobot single-track review-fix contract

## Inputs

- Read `review-output.md`, the `run-plan.md`, the `smoke-test-result.md`, and the failing diff.

## Outputs

- Write the smallest follow-up diff and, when needed, an updated `review-output.md` that shows the blocker is cleared.

## Pass / Fail

- Pass when the review blocker is resolved.
- Fail when the fix would need a new plan.

## Constraints

- Keep the flow single-track per issue.
