# Autobot phase contract — release-publish

## Load before work
- Load `git-workflow` and `build-and-test` before publishing.
- `git-workflow`
- `build-and-test`

## Inputs
- completed run state
- final verification evidence
- review results

## Responsibilities
- Read the completed run state, the final verification evidence.
- Use a deterministic pre-push guard: fetch `origin/main`, rebase when needed, and stop on conflict.
- deterministic pre-push rebase guard.
- Allow only bounded recovery for agent-fixable pre-push or check failures.
- bounded agent-fixable pre-push or check-failure recovery plan via `release-recovery.md`.
- Push, create the PR, and move Linear to `In Review` only after the PR exists.
- Do not add open-ended repair loops.

## Output
- PR URL
- concise publish summary
- any escalations or bounded recovery notes
