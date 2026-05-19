# Autobot single-track release-publish contract

## Inputs

- Read the completed run state, the final verification evidence, and any `review-output.md` or smoke-test notes.

## Outputs

- Publish the run summary; if release recovery is needed, write `release-recovery.md` with a bounded agent-fixable pre-push or check-failure recovery plan.

## Pass / Fail

- Pass when the release path is clean or bounded recovery resolves an agent-fixable pre-push or check failure.
- Fail when the release still depends on unresolved agent work outside that bounded scope.

## Constraints

- Keep the flow single-track per issue.
