# Autobot single-track prepare contract

## Inputs
- Read the queued item, run context, and any prior artifacts for the issue.

## Outputs
- Establish the run context needed for single-track planning.

## Pass / Fail
- Pass when the run is ready for classification and planning.
- Fail when the issue lacks the minimum context needed to continue.

## Constraints
- Keep the flow single-track per issue.
