# Autobot single-track release-publish contract

## Inputs

- Read the completed run state, the final verification evidence, and any `review-output.md` or smoke-test notes.

## Outputs

- Publish the run summary; if release recovery is needed, write `release-recovery.md` with the bounded rollback or retry plan.

## Pass / Fail

- Pass when the release path is clean or bounded recovery succeeds.
- Fail when the release still depends on unresolved agent work.

## Constraints

- Keep the flow single-track per issue.
