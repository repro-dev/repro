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
- Use a deterministic pre-push guard: fetch `origin/main`, verify whether `origin/main` is an ancestor of `HEAD`, rebase when needed, and stop on conflict.
- Record the deterministic pre-push rebase guard result.
- On rebase conflict, capture conflicting files, abort the rebase, post a concise Linear comment, set the issue back to `In Progress`, and escalate.
- Allow only bounded recovery for agent-fixable pre-push or check failures.
- bounded agent-fixable pre-push or check-failure recovery plan via `.autobot/runs/<issue-id>/attempt-<attempt>/release-recovery.md`.
- Retry transient push failures up to three times; escalate permanent failures immediately.
- Create a PR body with `Closes <issue-id>`, summary, verification, and notable risks or follow-ups.
- Do not paste full AI review output into the PR or Linear comments.
- Push, create the PR, and move Linear to `In Review` only after the PR exists.
- Do not wait on CI, merge status, or post-publish monitoring.
- Aggregate `tmp/friction.md` entries into the publish summary when present.
- Do not add open-ended repair loops.

## Output
- PR URL
- `.autobot/runs/<issue-id>/attempt-<attempt>/release-publish.md`
- concise publish summary
- any escalations or bounded recovery notes
