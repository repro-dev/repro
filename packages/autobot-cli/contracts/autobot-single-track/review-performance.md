# Autobot single-track review-performance contract

## Inputs
- Read the diff, the run plan, and the current runtime shape.

## Outputs
- Review for latency, cost, and unnecessary churn.

## Pass / Fail
- Pass when the change keeps the single-track path efficient.
- Fail when the change adds avoidable overhead.

## Constraints
- Keep the flow single-track per issue.
