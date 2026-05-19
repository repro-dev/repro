# Autobot single-track review-architecture-conventions contract

## Inputs

- Read the diff, the `run-plan.md`, the `smoke-test-result.md`, and the tracked contract files.

## Outputs

- Write `review-output.md` with architectural-fit and convention-drift findings for the changed diff and smoke test.

## Pass / Fail

- Pass when the change fits the existing Autobot architecture.
- Fail when the change drifts from the tracked contracts.

## Constraints

- Keep the flow single-track per issue.
