# Autobot single-track review-performance contract

## Inputs

- Read the diff, the `run-plan.md`, and the current runtime shape.

## Outputs

- Write `review-output.md` with latency, cost, and unnecessary churn findings.

## Pass / Fail

- Pass when the change keeps the single-track path efficient.
- Fail when the change adds avoidable overhead.

## Constraints

- Keep the flow single-track per issue.
