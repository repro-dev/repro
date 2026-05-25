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
- On rebase conflict, capture conflicting files, abort the rebase, write the exact Linear comment/status commands for an operator-approved recovery path, and escalate.
- Allow only bounded recovery planning for agent-fixable pre-push or check failures.
- bounded agent-fixable pre-push or check-failure recovery plan via `.autobot/runs/<issue-id>/attempt-<attempt>/release-recovery.md`.
- Prepare deterministic publish evidence, including the exact push command, PR creation command, PR body, and Linear transition/comment commands a human may approve and run.
- Document transient push retry commands and permanent-failure escalation criteria; do not execute push retries unattended.
- Prepare a PR body with `Closes <issue-id>`, summary, verification, and notable risks or follow-ups.
- Do not paste full AI review output into the PR or Linear comments.
- Do not push, create the PR, or move Linear to `In Review` without explicit operator approval outside this phase.
- Return the exact commands and recovery plan for the operator-approved publish path instead of performing unattended publish mutations.
- Do not wait on CI, merge status, or post-publish monitoring.
- Aggregate `tmp/friction.md` entries into the publish summary when present.
- Do not add open-ended repair loops.

## Output

- deterministic publish evidence and operator-approved publish commands
- `.autobot/runs/<issue-id>/attempt-<attempt>/release-publish.md`
- concise publish summary
- any escalations or bounded recovery notes
