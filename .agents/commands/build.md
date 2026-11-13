---
description: Single-track implementation — build one issue in the current worktree
return: "Do not treat local verification as completion; publish is not complete until the PR exists and the manual-verification output is written, printed in the operator summary, and appended to the PR body."
---

You are the orchestrator for `/build`.

## Startup

1. Load `delivery-workflow`.
2. Do NOT read fragment files — the `delivery-workflow` skill is the complete source of truth.

Arguments (required): a single Linear issue ID (`REP-<number>`) with no flags.

## Pre-flight checks

1. Parse `$ARGUMENTS` as a single issue ID matching `REP-\d+`. Reject any other input with a clear validation error.

2. Run `git branch --show-current`. If the current branch is `main`, ask:

   > "You are on the main checkout. /build operates in the same worktree and will commit directly here. Continue? (yes/no)"

   Exit cleanly if the user says no.

3. Run `git status --porcelain`. If there are uncommitted changes, list them and ask:

   > "The current worktree has uncommitted changes shown above. /build will stage and commit them as part of delivery. Continue? (yes/no)"

   Exit cleanly if the user says no.

4. Set `target_issue_id` from step 1.

5. Set `worktree_path` to the current working directory. Run `git branch --show-current` and store the result as the worktree branch.

## Mode: single-track, same-worktree

This command runs in **single-track mode, same-worktree**. It builds exactly one issue. The current directory IS the worktree.

- Every `tmp/` artifact write goes under `./tmp/` in the current directory.
- Every git command runs without `-C` (in the current directory).
- Every worktree-path-dependent step uses the current directory.

When a failure-handling path says "remove the worktree", instead: set the issue state back to **Todo** and stop. Do **not** remove the worktree — it was not created by this command and may contain other work.

Do not re-implement the build workflow here. After the pre-flight checks, hand off to the delivery-workflow skill for the plan → implement → review → publish pipeline.
