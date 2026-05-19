# Autobot single-track classify contract

## Inputs
- Read the prepared run context and the issue metadata.

## Outputs
- Assign the issue to the appropriate single-track phase lane.

## Pass / Fail
- Pass when the issue is classified into a single-issue execution path.
- Fail when the issue cannot be classified without more context.

## Constraints
- Keep the flow single-track per issue.
