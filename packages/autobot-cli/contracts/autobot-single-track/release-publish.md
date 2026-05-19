# Autobot single-track release-publish contract

## Inputs
- Read the completed run state and the final verification evidence.

## Outputs
- Publish the run with deterministic checks whenever possible.

## Pass / Fail
- Pass when the release path is clean or bounded recovery succeeds.
- Fail when the release still depends on unresolved agent work.

## Constraints
- Keep the flow single-track per issue.
